import { Lead, ILead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Activity } from "@/lib/models/Activity";
import { Conversation } from "@/lib/models/Conversation";
import { Sequence } from "@/lib/models/Sequence";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { getWhatsAppConfig, getAppBaseUrl } from "./settings.service";
import { sendWhatsAppMessage } from "./whatsapp.service";
import { generateOutreachEmail, generateWhatsAppMessage } from "./ai.service";

export type OutreachChannel = "email" | "whatsapp" | "sms";

export interface ChannelResult {
  channel: OutreachChannel;
  sent: boolean;
  error?: string;
}

export interface OutreachResult {
  sent: boolean;
  /** true when nothing was attempted (already sending / recently contacted) */
  skipped: boolean;
  /** primary channel (first attempted); see channelResults for the full picture */
  channel: OutreachChannel | null;
  channelResults?: ChannelResult[];
  subject?: string;
  body?: string;
  error?: string;
}

export interface OutreachOptions {
  senderName?: string;
  /** bypass the recently-contacted guard (manual single-lead sends) */
  force?: boolean;
  /** allow sending while the agent is in Draft (manual "Run" from Leads page) */
  ignoreAgentStatus?: boolean;
  baseUrl?: string;
}

/** Minimum gap before the same lead can be contacted again by automation. */
const RECONTACT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** A lead stuck in "sending" longer than this is considered crashed and reclaimable. */
const SENDING_STALE_MS = 10 * 60 * 1000;

const SEND_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 3000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < SEND_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Permanent errors: bad credentials/config — retrying won't help.
      if (/auth|credential|not configured|invalid|unauthorized|forbidden/i.test(msg)) throw err;
      if (attempt < SEND_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 3000));
      }
    }
  }
  throw lastErr;
}

function leadInfo(lead: ILead, senderName?: string) {
  return {
    fullName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
    firstName: lead.firstName,
    lastName: lead.lastName,
    jobTitle: lead.jobTitle,
    company: lead.company,
    source: lead.source,
    location: lead.location,
    website: lead.website,
    notes: lead.notes?.map(n => n.text) || [],
    senderName,
  };
}

async function markFailed(leadId: string, error: string) {
  await Lead.findByIdAndUpdate(leadId, {
    outreachStatus: "failed",
    lastOutreachError: error.slice(0, 500),
    $inc: { outreachAttempts: 1 },
  });
}

async function markSent(leadId: string) {
  await Lead.findByIdAndUpdate(leadId, {
    status: "in_outreach",
    pipelineStage: "contacted",
    outreachStatus: "sent",
    lastOutreachError: null,
    lastContactedAt: new Date(),
    $inc: { outreachAttempts: 1 },
  });
}

async function logOutreach(
  lead: ILead,
  agentId: string,
  channel: OutreachChannel,
  sent: boolean,
  content: string,
  error?: string
) {
  try {
    await Activity.create({
      agentId,
      leadId: lead._id,
      leadName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
      channel,
      event: sent
        ? (channel === "email" ? "AI Email Sent" : channel === "whatsapp" ? "AI WhatsApp Sent" : "AI SMS Sent")
        : (channel === "email" ? "AI Email Failed" : channel === "whatsapp" ? "AI WhatsApp Failed" : "AI SMS Failed"),
      detail: (error ? `Error: ${error}\n\n${content}` : content).slice(0, 2000),
    });
    // Only record messages that were actually delivered in the conversation thread.
    if (sent) {
      let convo = await Conversation.findOne({ leadId: lead._id, channel });
      if (!convo) convo = await Conversation.create({ leadId: lead._id, agentId, channel, messages: [] });
      convo.messages.push({ role: "agent", content, timestamp: new Date() });
      await convo.save();
    }
  } catch { /* logging must never break the send flow */ }
}

function buildResponseButtonsHtml(baseUrl: string, leadId: string): string {
  const interestedUrl = `${baseUrl}/api/leads/${leadId}/response?action=interested`;
  const notInterestedUrl = `${baseUrl}/api/leads/${leadId}/response?action=not_interested`;
  return `
<br><br>
<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea; font-family: sans-serif;">
  <p style="font-size: 13px; color: #666;">Are you open to a quick chat?</p>
  <div style="display: flex; gap: 12px; margin-top: 12px;">
    <a href="${interestedUrl}" style="display: inline-block; padding: 10px 18px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Yes, I'm interested</a>
    <a href="${notInterestedUrl}" style="display: inline-block; padding: 10px 18px; background-color: #f1f5f9; color: #475569; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; border: 1px solid #cbd5e1;">Not right now</a>
  </div>
</div>`;
}

/**
 * Which channels to use for the first touch:
 * - If the lead is attached to a sequence, use the channels of the earliest
 *   step(s) — steps sharing the same dayOffset+sendTime fire together, so a
 *   sequence with email AND WhatsApp at the same time sends BOTH.
 * - Otherwise: email preferred, WhatsApp as fallback when there is no email.
 */
async function channelsForLead(lead: ILead): Promise<OutreachChannel[]> {
  const canEmail = !!lead.email;
  const canWhatsApp = !!(lead.phone || lead.whatsappLid);
  const canSms = !!lead.phone;

  // Check lead's specific sequence, or fall back to agent's sequence
  const seq = lead.sequenceId
    ? await Sequence.findById(lead.sequenceId).lean()
    : await Sequence.findOne({ agentId: lead.agentId }).lean();

  if (seq?.steps?.length) {
    const sorted = [...seq.steps].sort(
      (a, b) => a.dayOffset - b.dayOffset || a.sendTime.localeCompare(b.sendTime)
    );
    const first = sorted[0];
    const sameSlot = sorted.filter(
      (s) => s.dayOffset === first.dayOffset && s.sendTime === first.sendTime
    );
    const channels = [...new Set(sameSlot.map((s) => s.channel))]
      .filter((c): c is OutreachChannel => c === "email" || c === "whatsapp" || c === "sms")
      .filter((c) => (c === "email" ? canEmail : c === "whatsapp" ? canWhatsApp : canSms));
    if (channels.length > 0) return channels;
  }

  if (canEmail) return ["email"];
  if (canWhatsApp) return ["whatsapp"];
  if (canSms) return ["sms"];
  return [];
}

/**
 * Send one AI outreach message to a lead. Channel choice is sequence-aware
 * (see channelsForLead) — a sequence with email + WhatsApp at the same time
 * sends on both channels.
 *
 * Guarantees:
 * - A lead is atomically claimed ("sending") so concurrent calls can't double-send.
 * - Lead status/pipeline only advance when at least one message was delivered.
 * - On failure the lead is marked outreachStatus="failed" with the reason, and
 *   remains eligible for retry.
 */
export async function sendOutreachToLead(leadId: string, opts: OutreachOptions = {}): Promise<OutreachResult> {
  const lead = await Lead.findById(leadId);
  if (!lead) return { sent: false, skipped: false, channel: null, error: "Lead not found" };

  const agentId = String(lead.agentId);
  const agent = await Agent.findById(agentId).lean();
  if (!agent) return { sent: false, skipped: false, channel: null, error: "Agent not found" };
  if (agent.status === "inactive" && !opts.ignoreAgentStatus) {
    return { sent: false, skipped: false, channel: null, error: "Agent is unpublished. Please publish the agent first." };
  }

  // Recently-contacted guard (automation only; manual sends pass force=true).
  if (!opts.force && lead.lastContactedAt && Date.now() - lead.lastContactedAt.getTime() < RECONTACT_COOLDOWN_MS) {
    return { sent: false, skipped: true, channel: null, error: "Contacted within the last 24h — skipped." };
  }

  // Atomic claim: refuse if another worker is currently sending this lead.
  const staleBefore = new Date(Date.now() - SENDING_STALE_MS);
  const claimed = await Lead.findOneAndUpdate(
    {
      _id: leadId,
      $or: [
        { outreachStatus: { $ne: "sending" } },
        { updatedAt: { $lt: staleBefore } },
      ],
    },
    { outreachStatus: "sending" },
    { new: true }
  );
  if (!claimed) {
    return { sent: false, skipped: true, channel: null, error: "Outreach already in progress for this lead." };
  }

  const info = leadInfo(lead, opts.senderName);
  const channels = await channelsForLead(lead);

  if (channels.length === 0) {
    const error = "Lead has no email or phone number.";
    await markFailed(leadId, error);
    return { sent: false, skipped: false, channel: null, error };
  }

  const channelResults: ChannelResult[] = [];
  let subject: string | undefined;
  let firstBody: string | undefined;

  for (const channel of channels) {
    try {
      if (channel === "email") {
        const cfg = await getEmailConfig(agentId);
        if (!cfg) {
          channelResults.push({ channel, sent: false, error: "Email not configured — add SMTP/API settings in Settings." });
          continue;
        }

        const generated = await generateOutreachEmail(agentId, {
          ...info,
          senderName: opts.senderName || cfg.fromName || "our team",
        });
        subject = generated.subject;
        firstBody = firstBody ?? generated.body;

        const baseUrl = opts.baseUrl || getAppBaseUrl();
        const content = `Subject: ${generated.subject}\n\n${generated.body}`;

        try {
          await withRetry(() => sendEmail(cfg, lead.email, generated.subject, generated.body, buildResponseButtonsHtml(baseUrl, leadId)));
          channelResults.push({ channel, sent: true });
          await logOutreach(lead, agentId, "email", true, content);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          channelResults.push({ channel, sent: false, error });
          await logOutreach(lead, agentId, "email", false, content, error);
        }
      } else if (channel === "whatsapp") {
        const waCfg = await getWhatsAppConfig(agentId);
        if (!waCfg) {
          channelResults.push({ channel, sent: false, error: "WhatsApp not configured — add API key and Session ID in Settings." });
          continue;
        }

        const message = await generateWhatsAppMessage(agentId, info);
        firstBody = firstBody ?? message;
        const target = lead.phone || lead.whatsappLid!;

        try {
          await withRetry(() => sendWhatsAppMessage(waCfg, target, message));
          channelResults.push({ channel, sent: true });
          await logOutreach(lead, agentId, "whatsapp", true, message);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          channelResults.push({ channel, sent: false, error });
          await logOutreach(lead, agentId, "whatsapp", false, message, error);
        }
      } else if (channel === "sms") {
        const baseUrl = opts.baseUrl || getAppBaseUrl();
        const message = await generateWhatsAppMessage(agentId, info); // Reuse short-form generator for SMS
        firstBody = firstBody ?? message;
        const target = lead.phone;

        if (!target) {
           channelResults.push({ channel, sent: false, error: "Lead has no phone number for SMS." });
           continue;
        }

        try {
          await withRetry(async () => {
            const smsSendRes = await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId,
                to: target,
                text: message,
              }),
            });
            const data = await smsSendRes.json();
            if (!smsSendRes.ok) throw new Error(data.error || "SMS dispatch failed");
          });
          
          channelResults.push({ channel, sent: true });
          await logOutreach(lead, agentId, "sms", true, message);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          channelResults.push({ channel, sent: false, error });
          await logOutreach(lead, agentId, "sms", false, message, error);
        }
      }
    } catch (err) {
      // AI generation (or other pre-send step) failed for this channel.
      const error = err instanceof Error ? err.message : String(err);
      channelResults.push({ channel, sent: false, error: `AI generation failed: ${error}` });
    }
  }

  const anySent = channelResults.some((r) => r.sent);
  const failures = channelResults.filter((r) => !r.sent);
  const errorSummary = failures.length
    ? failures.map((f) => `${f.channel}: ${f.error}`).join(" | ")
    : undefined;

  if (anySent) {
    await markSent(leadId);
    if (errorSummary) {
      // partial success — record which channel failed without blocking the lead
      await Lead.findByIdAndUpdate(leadId, { lastOutreachError: `Partial: ${errorSummary}`.slice(0, 500) });
    }
  } else {
    await markFailed(leadId, errorSummary ?? "Unknown error");
  }

  return {
    sent: anySent,
    skipped: false,
    channel: channels[0],
    channelResults,
    subject,
    body: firstBody,
    error: anySent ? undefined : errorSummary,
  };
}

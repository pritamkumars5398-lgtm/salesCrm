import { Lead, ILead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Activity } from "@/lib/models/Activity";
import { Conversation } from "@/lib/models/Conversation";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { getWhatsAppConfig, getAppBaseUrl } from "./settings.service";
import { sendWhatsAppMessage } from "./whatsapp.service";
import { generateOutreachEmail, generateWhatsAppMessage } from "./ai.service";

export interface OutreachResult {
  sent: boolean;
  /** true when nothing was attempted (already sending / recently contacted) */
  skipped: boolean;
  channel: "email" | "whatsapp" | null;
  subject?: string;
  body?: string;
  error?: string;
}

export interface OutreachOptions {
  senderName?: string;
  /** bypass the recently-contacted guard (manual single-lead sends) */
  force?: boolean;
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
  channel: "email" | "whatsapp",
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
        ? (channel === "email" ? "AI Email Sent" : "AI WhatsApp Sent")
        : (channel === "email" ? "AI Email Failed" : "AI WhatsApp Failed"),
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
 * Send one AI outreach message to a lead (email preferred, WhatsApp fallback).
 *
 * Guarantees:
 * - A lead is atomically claimed ("sending") so concurrent calls can't double-send.
 * - Lead status/pipeline only advance when the message was actually delivered.
 * - On failure the lead is marked outreachStatus="failed" with the reason, and
 *   remains eligible for retry.
 */
export async function sendOutreachToLead(leadId: string, opts: OutreachOptions = {}): Promise<OutreachResult> {
  const lead = await Lead.findById(leadId);
  if (!lead) return { sent: false, skipped: false, channel: null, error: "Lead not found" };

  const agentId = String(lead.agentId);
  const agent = await Agent.findById(agentId).lean();
  if (!agent) return { sent: false, skipped: false, channel: null, error: "Agent not found" };
  if (agent.status === "inactive") {
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

  const useWhatsApp = !lead.email && !!(lead.phone || lead.whatsappLid);
  const info = leadInfo(lead, opts.senderName);

  try {
    if (!useWhatsApp) {
      if (!lead.email) {
        const error = "Lead has no email or phone number.";
        await markFailed(leadId, error);
        return { sent: false, skipped: false, channel: null, error };
      }

      const cfg = await getEmailConfig(agentId);
      if (!cfg) {
        const error = "Email not configured — add SMTP/API settings in Settings.";
        await markFailed(leadId, error);
        return { sent: false, skipped: false, channel: "email", error };
      }

      const { subject, body } = await generateOutreachEmail(agentId, {
        ...info,
        senderName: opts.senderName || cfg.fromName || "our team",
      });

      const baseUrl = opts.baseUrl || getAppBaseUrl();
      const content = `Subject: ${subject}\n\n${body}`;

      try {
        await withRetry(() => sendEmail(cfg, lead.email, subject, body, buildResponseButtonsHtml(baseUrl, leadId)));
        await markSent(leadId);
        await logOutreach(lead, agentId, "email", true, content);
        return { sent: true, skipped: false, channel: "email", subject, body };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await markFailed(leadId, error);
        await logOutreach(lead, agentId, "email", false, content, error);
        return { sent: false, skipped: false, channel: "email", subject, body, error };
      }
    }

    // WhatsApp branch (no email on the lead)
    const waCfg = await getWhatsAppConfig(agentId);
    if (!waCfg) {
      const error = "WhatsApp not configured — add API key and Session ID in Settings.";
      await markFailed(leadId, error);
      return { sent: false, skipped: false, channel: "whatsapp", error };
    }

    const message = await generateWhatsAppMessage(agentId, info);
    const target = lead.phone || lead.whatsappLid!;

    try {
      await withRetry(() => sendWhatsAppMessage(waCfg, target, message));
      await markSent(leadId);
      await logOutreach(lead, agentId, "whatsapp", true, message);
      return { sent: true, skipped: false, channel: "whatsapp", body: message };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await markFailed(leadId, error);
      await logOutreach(lead, agentId, "whatsapp", false, message, error);
      return { sent: false, skipped: false, channel: "whatsapp", body: message, error };
    }
  } catch (err) {
    // AI generation (or other pre-send step) failed — nothing was sent.
    const error = err instanceof Error ? err.message : String(err);
    await markFailed(leadId, error);
    return { sent: false, skipped: false, channel: useWhatsApp ? "whatsapp" : "email", error: `AI generation failed: ${error}` };
  }
}

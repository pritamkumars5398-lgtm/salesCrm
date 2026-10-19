import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { Setting } from "@/lib/models/Setting";
import { Activity } from "@/lib/models/Activity";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { handleAgentReply } from "@/lib/agent-reply";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { eventEmitter } from "@/lib/events";
import { getAppBaseUrl } from "@/server/services/settings.service";
import { Agent } from "@/lib/models/Agent";
import { authorizeLead } from "@/server/auth/access";
import { platformEnv } from "@/server/services/platform-credentials";
import { generateFollowUpEmail } from "@/server/services/ai.service";
import { leadAiContext } from "@/server/services/playbook.service";
import { getLeadHistory } from "@/server/services/lead-history.service";

function cleanEmailBody(body: string): string {
  if (!body) return "";

  // Split on common email quote headers
  const patterns = [
    /^\s*On\s+.*?\s+wrote:\s*$/im,
    /^\s*On\s+.*?\s+at\s+.*?\s*wrote:\s*$/im,
    /^\s*-{3,}\s*Original\s+Message\s*-{3,}\s*$/im,
    /^\s*From:\s+.*?\s*$/im,
  ];

  let cleaned = body;
  for (const pattern of patterns) {
    const parts = cleaned.split(pattern);
    if (parts.length > 0) {
      cleaned = parts[0];
    }
  }

  // Also strip trailing quote characters like ">" and empty lines at the end
  const lines = cleaned.split("\n");
  const resultLines: string[] = [];
  
  for (const line of lines) {
    // If a line starts with a blockquote indicator like ">", we stop taking lines
    if (/^\s*>/.test(line)) {
      break;
    }
    resultLines.push(line);
  }

  return resultLines.join("\n").trim();
}

// Concurrency safety lock for IMAP syncing
declare global {
  var _syncingLeads: Set<string> | undefined;
}
const syncingLeads = global._syncingLeads ?? new Set<string>();
if (process.env.NODE_ENV !== "production") {
  global._syncingLeads = syncingLeads;
}

/**
 * Two workspaces of one organization may read the same inbox. When the same
 * person is a lead in both, only the workspace that emailed them most recently
 * imports their replies — otherwise both AIs would answer the same email.
 */
async function anotherWorkspaceOwnsThread(lead: { _id: unknown; agentId: unknown; email: string }, imapUser: string): Promise<boolean> {
  const agent = await Agent.findById(lead.agentId).select("organizationId").lean();
  if (!agent?.organizationId) return false;
  const siblings = await Agent.find({ organizationId: agent.organizationId, deletedAt: null, _id: { $ne: lead.agentId } }).select("_id").lean();
  if (siblings.length === 0) return false;
  const sharing = await Setting.find({ agentId: { $in: siblings.map((a) => a._id) }, key: "imapUser", value: new RegExp(`^${imapUser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).select("agentId").lean();
  if (sharing.length === 0) return false;
  const twins = await Lead.find({ agentId: { $in: sharing.map((r) => r.agentId) }, email: lead.email.toLowerCase(), deletedAt: null }).select("_id").lean();
  if (twins.length === 0) return false;

  const lastOutbound = async (leadIds: unknown[]) => {
    const convos = await Conversation.find({ leadId: { $in: leadIds }, channel: "email" }).select("messages.role messages.timestamp").lean();
    let latest = 0;
    for (const c of convos) for (const m of c.messages) if (m.role === "agent") latest = Math.max(latest, new Date(m.timestamp).getTime());
    return latest;
  };
  const [mine, theirs] = await Promise.all([lastOutbound([lead._id]), lastOutbound(twins.map((t) => t._id))]);
  return theirs > mine;
}

async function sendAutomatedFollowUp(lead: any, agentId: string, followUpNum: number, convo: any) {
  try {
    // Every channel, not only this email thread — a call or WhatsApp chat in between changes what to say.
    const history = await getLeadHistory(lead._id, { maxChars: 5000 }).catch(() => null);
    const conversationHistory = history?.hasHistory
      ? `${history.overview}\n${history.timeline}`
      : convo.messages.map((m: any) => `${m.role === "agent" ? "Agent" : "Lead"}: ${m.content}`).join("\n\n");
    const leadCtx = await leadAiContext(agentId, lead).catch(() => ({ facts: "", groupGuidance: "" }));
    const parsed = await generateFollowUpEmail(agentId, {
      leadName: lead.fullName,
      company: lead.company,
      history: conversationHistory,
      followUpNum,
      facts: leadCtx.facts,
      groupGuidance: leadCtx.groupGuidance,
    });
    const savedContent = parsed.subject ? `Subject: ${parsed.subject}\n\n${parsed.body}` : parsed.body;

    // Send first — only record the follow-up once the provider accepted it.
    if (!lead.email) return;
    const emailConfig = await getEmailConfig(agentId);
    if (!emailConfig) return;
    const baseUrl = getAppBaseUrl();
    const interestedUrl = `${baseUrl}/api/leads/${lead._id}/response?action=interested`;
    const notInterestedUrl = `${baseUrl}/api/leads/${lead._id}/response?action=not_interested`;

    const htmlButtons = `
<br><br>
<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea; font-family: sans-serif;">
  <p style="font-size: 13px; color: #666;">Are you open to a quick chat?</p>
  <div style="display: flex; gap: 12px; margin-top: 12px;">
    <a href="${interestedUrl}" style="display: inline-block; padding: 10px 18px; background-color: #df2a2a; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Yes, I'm interested</a>
    <a href="${notInterestedUrl}" style="display: inline-block; padding: 10px 18px; background-color: #f1f5f9; color: #475569; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; border: 1px solid #cbd5e1;">Not right now</a>
  </div>
</div>
`;
    await sendEmail(emailConfig, lead.email, parsed.subject || "Following up", parsed.body, htmlButtons);

    convo.messages.push({
      role: "agent",
      content: savedContent,
      timestamp: new Date(),
    });
    await convo.save();
    eventEmitter.emit("message", { leadId: lead._id.toString() });

    // Log Activity
    await Activity.create({
      agentId,
      leadId: lead._id,
      leadName: lead.fullName,
      channel: "email",
      event: `Automated Follow-up #${followUpNum}`,
      detail: savedContent.slice(0, 2000),
    });

  } catch (err) {
    console.error(`Failed to send automated follow-up #${followUpNum}:`, err);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");

  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }
  const access = await authorizeLead(req, leadId);
  if (!access.ok) return access.response;

  // Prevent multiple simultaneous syncs for the same lead
  if (syncingLeads.has(leadId)) {
    console.log(`[Sync] Sync already in progress for lead ${leadId}, skipping duplicate request.`);
    return NextResponse.json({ success: true, count: 0, messages: [], status: "sync_in_progress" });
  }

  syncingLeads.add(leadId);

  try {
    await connectDB();
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.email) {
      return NextResponse.json({ error: "Lead has no email address" }, { status: 400 });
    }

    const agentId = lead.agentId;

    // Fetch IMAP settings
    const keys = ["imapHost", "imapPort", "imapUser", "imapPass"];
    const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    const env = await platformEnv(String(agentId));
    const host = m.imapHost || env("IMAP_HOST");
    const port = parseInt(m.imapPort || env("IMAP_PORT") || "993", 10);
    const user = m.imapUser || env("IMAP_USER");
    const pass = m.imapPass || env("IMAP_PASS");

    if (!host || !user || !pass) {
      return NextResponse.json({ error: "IMAP settings are not configured. Please go to Settings -> Email and configure IMAP Host, Username, and Password." }, { status: 400 });
    }

    if (await anotherWorkspaceOwnsThread(lead, user)) {
      const existing = await Conversation.findOne({ leadId, channel: "email" }).lean();
      return NextResponse.json({ success: true, count: 0, messages: existing?.messages ?? [], status: "handled_by_other_workspace" });
    }

    // Load email config to find the agent's sender address
    const emailConfig = await getEmailConfig(agentId.toString());
    const agentEmailAddr = emailConfig?.fromAddress || user;

    // Connect to IMAP
    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false,
    });

    let newMessagesAdded = 0;
    let convo = await Conversation.findOne({ leadId, channel: "email" });
    if (!convo) {
      convo = await Conversation.create({
        leadId,
        agentId,
        channel: "email",
        messages: [],
      });
    }

    await client.connect();
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        // Search for emails from the lead
        const searchResults = await client.search({ from: lead.email });

        if (searchResults && Array.isArray(searchResults)) {
          for (const uid of searchResults) {
            const raw = await client.fetchOne(String(uid), { source: true });
            if (!raw || !raw.source) continue;

            const parsed = await simpleParser(raw.source);
          
             // Exclude emails sent from the agent's own email address
            const fromAddress = parsed.from?.value?.[0]?.address;
            if (fromAddress) {
              const isAgentAddress = fromAddress.toLowerCase() === user.toLowerCase() ||
                                     (agentEmailAddr && fromAddress.toLowerCase() === agentEmailAddr.toLowerCase());
            
              if (isAgentAddress) {
                // If testing with the same email address for agent and lead, only allow replies (Subject starting with Re:)
                const isTestingSameEmail = lead.email.toLowerCase() === user.toLowerCase() ||
                                           (agentEmailAddr && lead.email.toLowerCase() === agentEmailAddr.toLowerCase());
              
                const subject = parsed.subject || "";
                const isReplySubject = /^re:/i.test(subject);
              
                if (!isTestingSameEmail || !isReplySubject) {
                  continue;
                }
              }
            }

            const rawBody = parsed.text || (typeof parsed.html === "string" ? parsed.html.replace(/<[^>]*>/g, "") : "") || "";
            const emailBody = cleanEmailBody(rawBody);
            const emailDate = parsed.date || new Date();
            const messageId = parsed.messageId || String(emailDate.getTime());

            // Check for duplicates (within 5 minutes for identical text content)
            const exists = convo.messages.some(
              (msg) => msg.meta?.messageId === messageId || 
                       (Math.abs(new Date(msg.timestamp).getTime() - emailDate.getTime()) < 300000 && msg.content.trim() === emailBody.trim())
            );

            if (!exists) {
              convo.messages.push({
                role: "lead",
                content: emailBody,
                timestamp: emailDate,
                meta: { messageId },
              });
              newMessagesAdded++;
            }
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      // Always release the IMAP connection — this route runs every 25s while a drawer is open.
      await client.logout().catch(() => client.close());
    }

    if (newMessagesAdded > 0) {
      await convo.save();

      // Emit event for new synced client messages
      eventEmitter.emit("message", { leadId });

      // Automatically update lead status to "replied" if not already
      if (lead.status === "new" || lead.status === "in_outreach") {
        lead.status = "replied";
        if (lead.pipelineStage === "new" || lead.pipelineStage === "contacted") lead.pipelineStage = "replied";
        await lead.save();

        await Activity.create({
          agentId,
          leadId,
          leadName: lead.fullName,
          channel: "email",
          event: "Lead replied via Email (IMAP Sync)",
          detail: `Received ${newMessagesAdded} new email replies.`,
        });
      }

      // Automatically trigger agent auto-response if the agent is enabled (ON)
      if (lead.agentEnabled) {
        const lastLeadMessage = convo.messages[convo.messages.length - 1];
        if (lastLeadMessage && lastLeadMessage.role === "lead") {
          // Trigger the AI reply generation and mail dispatch
          await handleAgentReply(lead, agentId.toString(), lastLeadMessage.content, "email");
          
          // Reload the updated conversation list so it contains both lead response and agent response
          convo = await Conversation.findOne({ leadId, channel: "email" });
        }
      }
    }

    // --- AUTOMATED DAILY FOLLOW-UP CHECK ---
    if (lead.status === "in_outreach" && lead.agentEnabled) {
      const followUpSetting = await Setting.findOne({ agentId, key: "followUpDays" }).lean();
      const followUpLimitStr = followUpSetting?.value || "3";
      
      if (followUpLimitStr !== "Disabled") {
        const limit = parseInt(followUpLimitStr, 10) || 3;
        
        // Reload conversation in case new IMAP messages or agent messages were added
        const activeConvo = await Conversation.findOne({ leadId, channel: "email" });
        if (activeConvo && activeConvo.messages.length > 0) {
          const lastMsg = activeConvo.messages[activeConvo.messages.length - 1];
          if (lastMsg.role === "agent") {
            const lastMsgTime = new Date(lastMsg.timestamp).getTime();
            const now = Date.now();
            const diffMs = now - lastMsgTime;
            
            // 1 minute in dev, 24 hours in prod
            const isDev = process.env.NODE_ENV === "development";
            const intervalMs = isDev ? 60 * 1000 : 24 * 60 * 60 * 1000;
            
            if (diffMs >= intervalMs) {
              const agentMsgs = activeConvo.messages.filter((m) => m.role === "agent");
              const followUpsSent = agentMsgs.length - 1; // excluding the initial outreach
              
              if (followUpsSent < limit) {
                await sendAutomatedFollowUp(lead, agentId.toString(), followUpsSent + 1, activeConvo);
                // Reload convo so that the response returns the updated messages array
                convo = await Conversation.findOne({ leadId, channel: "email" });
              }
            }
          }
        }
      }
    }
 
    return NextResponse.json({ success: true, count: newMessagesAdded, messages: convo?.messages ?? [] });

  } catch (err: unknown) {
    console.error("IMAP sync failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `IMAP connection failed: ${msg}` }, { status: 500 });
  } finally {
    if (leadId) {
      syncingLeads.delete(leadId);
    }
  }
}

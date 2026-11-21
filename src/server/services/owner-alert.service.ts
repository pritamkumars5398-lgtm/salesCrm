import { Types } from "mongoose";
import { Activity } from "@/lib/models/Activity";
import { Agent } from "@/lib/models/Agent";
import { Membership } from "@/lib/models/Membership";
import { User } from "@/lib/models/User";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { getSettingsMap } from "./settings.service";

/**
 * "A lead is interested" email to the business owner.
 *
 * Sent when a call ends with interest / a meeting / a callback request, when a
 * WhatsApp or email reply shows clear interest, or when the lead clicks
 * "I'm interested" in an email. Goes to the alert email set in Business details,
 * else to the organization owner's login email. At most one alert per lead per day.
 */

const ALERT_EVENT = "Owner alerted: lead interested";
const ONCE_PER_MS = 24 * 60 * 60 * 1000;

export interface InterestAlert {
  agentId: string;
  lead: { _id: Types.ObjectId | string; fullName?: string; company?: string; phone?: string; email?: string };
  channel: "call" | "whatsapp" | "email" | "sms";
  /** one line: why we think they're interested */
  reason: string;
  /** what the lead said, or the call summary */
  said?: string;
}

const CHANNEL_NAME: Record<InterestAlert["channel"], string> = { call: "a phone call", whatsapp: "WhatsApp", email: "email", sms: "SMS" };

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function ownerLoginEmail(agentId: string): Promise<string> {
  const agent = await Agent.findById(agentId).select("organizationId").lean();
  if (!agent?.organizationId) return "";
  const owner = await Membership.findOne({ organizationId: agent.organizationId, role: "owner" }).select("userId").lean();
  if (!owner) return "";
  const user = await User.findById(owner.userId).select("email").lean();
  return user?.email || "";
}

/** Who gets the alert, or "" when alerts are off / nobody to send to. */
export async function interestAlertRecipients(agentId: string): Promise<string[]> {
  const m = await getSettingsMap(agentId, ["ownerAlertEmail", "ownerInterestAlerts"]);
  if (m.ownerInterestAlerts === "Off") return [];
  const listed = (m.ownerAlertEmail || "").split(/[,;\s]+/).map((s) => s.trim()).filter(isEmail);
  if (listed.length) return [...new Set(listed)].slice(0, 5);
  const fallback = await ownerLoginEmail(agentId);
  return fallback ? [fallback] : [];
}

/** Never throws — an alert failing must not break a reply or a call. */
export async function notifyOwnerOfInterest(a: InterestAlert): Promise<void> {
  try {
    const leadId = new Types.ObjectId(String(a.lead._id));
    const recent = await Activity.findOne({ agentId: a.agentId, leadId, event: ALERT_EVENT, createdAt: { $gte: new Date(Date.now() - ONCE_PER_MS) } }).select("_id").lean();
    if (recent) return;

    const to = await interestAlertRecipients(a.agentId);
    if (!to.length) return;
    const cfg = await getEmailConfig(a.agentId);
    if (!cfg) {
      console.warn(`[Owner alert] Email isn't set up for workspace ${a.agentId}; skipped.`);
      return;
    }

    const [{ brandName }, agent] = await Promise.all([
      getSettingsMap(a.agentId, ["brandName"]),
      Agent.findById(a.agentId).select("name").lean(),
    ]);
    const business = brandName || agent?.name || "your business";
    const name = a.lead.fullName || "A lead";
    const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");

    const lines = [
      `Good news — ${name}${a.lead.company ? ` (${a.lead.company})` : ""} looks interested, on ${CHANNEL_NAME[a.channel]}.`,
      "",
      `Why: ${a.reason}`,
      a.said ? `\nWhat they said:\n"${a.said.slice(0, 600)}"` : "",
      "",
      a.lead.phone ? `Phone: ${a.lead.phone}` : "",
      a.lead.email ? `Email: ${a.lead.email}` : "",
      "",
      "Reach out soon while they're warm.",
      appUrl ? `\nOpen your leads: ${appUrl}/leads/${a.agentId}` : "",
      "",
      `— Your AI sales assistant for ${business}`,
    ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));

    const subject = `🔥 ${name} is interested — ${business}`;
    for (const addr of to) await sendEmail(cfg, addr, subject, lines.join("\n"));

    await Activity.create({
      agentId: a.agentId, leadId, leadName: name, channel: a.channel === "call" ? "call" : a.channel,
      event: ALERT_EVENT, detail: `Emailed ${to.join(", ")} — ${a.reason}`.slice(0, 2000),
    });
  } catch (err) {
    console.error("[Owner alert] failed:", err instanceof Error ? err.message : err);
  }
}

import { Types } from "mongoose";
import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { Call } from "@/lib/models/Call";
import { Meeting } from "@/lib/models/Meeting";

/**
 * Everything that has happened with a lead, across every channel, as one
 * timeline the AI can read before it writes, replies or calls — so a call
 * knows what was said on WhatsApp, and an email reply knows what was agreed
 * on the call.
 *
 * Only this workspace's records are used: the same person can be a lead of
 * another business line, and that history must never leak into this pitch.
 */

export interface LeadHistory {
  /** true when we've been in touch before (any message, call or meeting) */
  hasHistory: boolean;
  /** one-line overview: first contact, channels used, last outcome */
  overview: string;
  /** chronological timeline, oldest → newest, already trimmed to fit a prompt */
  timeline: string;
  /** channels that were used, e.g. ["whatsapp", "call"] */
  channels: string[];
}

const CHANNEL_NAME: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS", call: "Call" };
const EMPTY: LeadHistory = { hasHistory: false, overview: "", timeline: "", channels: [] };

interface Entry {
  at: Date;
  line: string;
}

function when(d: Date): string {
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: process.env.CALL_TIMEZONE || "Asia/Kolkata" });
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** Other lead records in this workspace for the same person (duplicate imports share an email or phone). */
async function samePersonLeadIds(lead: { _id: unknown; agentId: unknown; email?: string; phone?: string }): Promise<Types.ObjectId[]> {
  const or: Record<string, unknown>[] = [];
  if (lead.email) or.push({ email: lead.email.toLowerCase() });
  const last10 = (lead.phone || "").replace(/\D/g, "").slice(-10);
  if (last10.length === 10) or.push({ phone: new RegExp(`${last10}$`) });
  const ids = [new Types.ObjectId(String(lead._id))];
  if (or.length === 0) return ids;
  const twins = await Lead.find({ agentId: lead.agentId, _id: { $ne: lead._id }, deletedAt: null, $or: or }).select("_id").limit(5).lean();
  return [...ids, ...twins.map((t) => t._id as Types.ObjectId)];
}

/**
 * @param maxChars   prompt budget for the timeline (newest entries are kept first)
 * @param skipLatestLeadMessage  drop the newest inbound message — the caller quotes it separately
 */
export async function getLeadHistory(
  leadId: Types.ObjectId | string,
  opts: { maxChars?: number; skipLatestLeadMessage?: boolean } = {},
): Promise<LeadHistory> {
  const lead = await Lead.findById(leadId).select("agentId email phone notes status pipelineStage").lean();
  if (!lead) return EMPTY;
  const ids = await samePersonLeadIds(lead);
  const maxChars = opts.maxChars ?? 3500;

  const [convos, calls, meetings] = await Promise.all([
    Conversation.find({ leadId: { $in: ids }, agentId: lead.agentId }).select("channel messages").lean(),
    Call.find({ leadId: { $in: ids }, agentId: lead.agentId, isTest: { $ne: true }, mode: "ai" })
      .sort({ createdAt: -1 }).limit(10)
      .select("status createdAt durationSec summary outcome sentiment transcript hangupCause").lean(),
    Meeting.find({ leadId: { $in: ids }, agentId: lead.agentId }).select("title scheduledAt status").lean(),
  ]);

  const entries: Entry[] = [];
  const channels = new Set<string>();

  for (const c of convos) {
    if (c.channel === "call") continue; // calls come from the Call records below, with more detail
    for (const m of c.messages) {
      if (!m.content?.trim()) continue;
      channels.add(c.channel);
      const who = m.role === "agent" ? "Us" : "Lead";
      entries.push({ at: new Date(m.timestamp), line: `[${when(new Date(m.timestamp))} · ${CHANNEL_NAME[c.channel]}] ${who}: ${clip(m.content, 350)}` });
    }
  }

  if (opts.skipLatestLeadMessage) {
    const latestInbound = entries.filter((e) => e.line.includes("] Lead: ")).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (latestInbound) entries.splice(entries.indexOf(latestInbound), 1);
  }

  calls.forEach((call, i) => {
    channels.add("call");
    const at = new Date(call.createdAt);
    if (call.status !== "completed") {
      entries.push({ at, line: `[${when(at)} · Call] We called — ${call.status.replace(/_/g, " ")}${call.hangupCause ? ` (${call.hangupCause})` : ""}.` });
      return;
    }
    const mins = Math.round((call.durationSec || 0) / 60);
    let line = `[${when(at)} · Call] ${mins ? `${mins}-min ` : ""}call${call.outcome ? `, outcome: ${call.outcome.replace(/_/g, " ")}` : ""}${call.sentiment ? `, ${call.sentiment}` : ""}. ${call.summary ? clip(call.summary, 400) : ""}`;
    // The most recent conversation in their own words: what was promised matters on the next touch.
    if (i === 0 && call.transcript?.length) {
      const turns = call.transcript.slice(-8).map((t) => `${t.role === "agent" ? "Us" : "Lead"}: ${clip(t.content, 160)}`).join(" / ");
      line += ` Last part of that call — ${turns}`;
    }
    entries.push({ at, line });
  });

  for (const n of lead.notes ?? []) {
    entries.push({ at: new Date(n.createdAt), line: `[${when(new Date(n.createdAt))} · Note by ${n.author}] ${clip(n.text, 300)}` });
  }
  for (const m of meetings) {
    entries.push({ at: new Date(m.scheduledAt), line: `[${when(new Date(m.scheduledAt))} · Meeting] ${m.title} — ${m.status}` });
  }

  if (entries.length === 0) return EMPTY;

  // Newest first until the budget is used, then back to chronological order.
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  const kept: Entry[] = [];
  let used = 0;
  for (const e of entries) {
    if (used + e.line.length > maxChars) break;
    kept.push(e);
    used += e.line.length + 1;
  }
  kept.reverse();
  const dropped = entries.length - kept.length;

  const first = entries[entries.length - 1].at;
  const lastCall = calls.find((c) => c.status === "completed");
  const overview = [
    `First contact ${when(first)}`,
    channels.size ? `talked on ${[...channels].map((c) => CHANNEL_NAME[c] ?? c).join(", ")}` : "",
    `${entries.length} interaction${entries.length === 1 ? "" : "s"}`,
    lastCall?.outcome ? `last call outcome: ${lastCall.outcome.replace(/_/g, " ")}` : "",
    `status now: ${lead.status.replace(/_/g, " ")}`,
  ].filter(Boolean).join(" · ");

  return {
    hasHistory: true,
    overview,
    timeline: `${dropped > 0 ? `(${dropped} older interaction${dropped === 1 ? "" : "s"} not shown)\n` : ""}${kept.map((e) => e.line).join("\n")}`,
    channels: [...channels],
  };
}

/** Prompt section + rules, or "" when there is no history yet. */
export function historyPromptBlock(h: LeadHistory, heading = "EVERYTHING THAT HAPPENED WITH THIS LEAD SO FAR (all channels, oldest first)"): string {
  if (!h.hasHistory) return "";
  return `${heading}:
${h.overview}
${h.timeline}

How to use this history:
- You already know this person — never introduce yourself or the company as if it were the first contact.
- Refer back naturally to what was said or agreed (e.g. "as we discussed on the call…", "following up on your WhatsApp message…"). Never ask for something they already told us.
- Keep promises we made (sending details, calling back at a time). Don't repeat an offer they already declined.
- If they said they're not interested, be brief and respectful.
`;
}

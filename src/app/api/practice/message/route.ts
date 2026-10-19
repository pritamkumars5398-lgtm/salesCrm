import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeLead } from "@/server/auth/access";
import { draftOutreachMessage } from "@/server/services/outreach.service";
import { writeAgentReply } from "@/lib/agent-reply";

const CHANNELS = ["email", "whatsapp", "sms"] as const;
type PracticeChannel = (typeof CHANNELS)[number];

interface Turn {
  role: "agent" | "lead";
  text: string;
}

/**
 * Practice mode for text channels — nothing is sent, saved or changed on the lead.
 * POST { leadId, channel, turns, mode: "opening" | "reply" }
 *  opening → the first outreach message the AI would send on this channel
 *  reply   → the AI's answer to the lead's latest message (the last turn)
 * The same writers as the real send/auto-reply are used, with the lead's real
 * history plus this practice conversation.
 */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeLead(req, body.leadId);
  if (!access.ok) return access.response;
  const channel = body.channel as PracticeChannel;
  if (!CHANNELS.includes(channel)) return NextResponse.json({ error: "channel must be email, whatsapp or sms" }, { status: 400 });

  const turns: Turn[] = (Array.isArray(body.turns) ? body.turns : [])
    .filter((t: Turn) => (t?.role === "agent" || t?.role === "lead") && typeof t.text === "string" && t.text.trim())
    .slice(-20)
    .map((t: Turn) => ({ role: t.role, text: t.text.slice(0, 2000) }));

  try {
    if (body.mode === "opening") {
      const draft = await draftOutreachMessage(access.lead, channel);
      return NextResponse.json({ subject: draft.subject ?? null, body: draft.body, status: null, fields: null });
    }
    const last = turns[turns.length - 1];
    if (!last || last.role !== "lead") return NextResponse.json({ error: "Type what the lead says first." }, { status: 400 });
    const reply = await writeAgentReply(access.lead, access.agentId, last.text, channel, { practiceTurns: turns.slice(0, -1) });
    return NextResponse.json({
      subject: channel === "email" ? reply.subject ?? null : null,
      body: reply.body,
      // What would happen for real: lead status change and AI-filled fields.
      status: reply.status === "closed" ? "closed" : "replied",
      fields: reply.fields && typeof reply.fields === "object" ? reply.fields : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "The AI couldn't write a reply." }, { status: 502 });
  }
}

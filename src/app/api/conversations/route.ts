import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Conversation } from "@/lib/models/Conversation";
import { Activity } from "@/lib/models/Activity";
import { handleAgentReply } from "@/lib/agent-reply";
import { eventEmitter } from "@/lib/events";
import { authorizeLead, authorizeWorkspace } from "@/server/auth/access";

const CHANNELS = ["email", "whatsapp", "sms", "call"];

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const leadId  = searchParams.get("leadId");
  const channel = searchParams.get("channel");

  const filter: Record<string, unknown> = {};
  if (leadId) {
    const access = await authorizeLead(req, leadId);
    if (!access.ok) return access.response;
    filter.leadId = access.lead._id;
    filter.agentId = access.lead.agentId;
  } else {
    const access = await authorizeWorkspace(req, searchParams.get("agentId"));
    if (!access.ok) return access.response;
    filter.agentId = access.agentId;
  }
  if (channel) filter.channel = channel;

  const convos = await Conversation.find(filter).lean();
  return NextResponse.json(convos);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeLead(req, body.leadId);
  if (!access.ok) return access.response;
  const { lead } = access;
  if (!CHANNELS.includes(body.channel) || !["agent", "lead"].includes(body.role) || typeof body.content !== "string" || !body.content.trim()) {
    return NextResponse.json({ error: "channel, role and content are required" }, { status: 400 });
  }

  let convo = await Conversation.findOne({ leadId: lead._id, channel: body.channel });

  if (!convo) {
    convo = await Conversation.create({
      leadId:   lead._id,
      agentId:  lead.agentId,
      channel:  body.channel,
      messages: [],
    });
  }

  convo.messages.push({
    role:      body.role,
    content:   body.content,
    timestamp: new Date(),
  });
  await convo.save();

  // Emit event for new message
  eventEmitter.emit("message", { leadId: String(lead._id) });

  await Activity.create({
    agentId:  lead.agentId,
    leadId:   lead._id,
    leadName: lead.fullName,
    channel:  body.channel,
    event:    body.role === "agent" ? `Message sent via ${body.channel}` : `Reply received on ${body.channel}`,
    detail:   body.content.slice(0, 120),
  });

  if (body.role === "lead" && lead.agentEnabled) {
    await handleAgentReply(lead, String(lead.agentId), body.content, body.channel);
    convo = await Conversation.findOne({ leadId: lead._id, channel: body.channel });
  }

  return NextResponse.json(convo, { status: 200 });
}

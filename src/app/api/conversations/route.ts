import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Conversation } from "@/lib/models/Conversation";
import { Activity } from "@/lib/models/Activity";
import { Lead } from "@/lib/models/Lead";
import { handleAgentReply } from "@/lib/agent-reply";
import { eventEmitter } from "@/lib/events";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const leadId  = searchParams.get("leadId");
  const channel = searchParams.get("channel");
  const agentId = searchParams.get("agentId");

  const filter: Record<string, unknown> = {};
  if (leadId) filter.leadId = leadId;
  if (channel) filter.channel = channel;
  if (agentId) filter.agentId = agentId;

  const convos = await Conversation.find(filter).lean();
  return NextResponse.json(convos);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();

  let convo = await Conversation.findOne({ leadId: body.leadId, channel: body.channel });

  if (!convo) {
    convo = await Conversation.create({
      leadId:   body.leadId,
      agentId:  body.agentId,
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
  eventEmitter.emit("message", { leadId: body.leadId });

  const lead = await Lead.findById(body.leadId);
  if (lead) {
    await Activity.create({
      agentId:  body.agentId,
      leadId:   body.leadId,
      leadName: lead.fullName,
      channel:  body.channel,
      event:    body.role === "agent" ? `Message sent via ${body.channel}` : `Reply received on ${body.channel}`,
      detail:   body.content.slice(0, 120),
    });

    if (body.role === "lead" && lead.agentEnabled) {
      await handleAgentReply(lead, String(body.agentId), body.content, body.channel);
      convo = await Conversation.findOne({ leadId: body.leadId, channel: body.channel });
    }
  }

  return NextResponse.json(convo, { status: 200 });
}

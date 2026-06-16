import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Conversation } from "@/lib/models/Conversation";
import { Activity } from "@/lib/models/Activity";
import { Lead } from "@/lib/models/Lead";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const leadId  = searchParams.get("leadId");
  const channel = searchParams.get("channel");

  const filter: Record<string, unknown> = {};
  if (leadId) filter.leadId = leadId;
  if (channel) filter.channel = channel;

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

  const lead = await Lead.findById(body.leadId).lean();
  if (lead) {
    await Activity.create({
      agentId:  body.agentId,
      leadId:   body.leadId,
      leadName: lead.fullName,
      channel:  body.channel,
      event:    body.role === "agent" ? `Message sent via ${body.channel}` : `Reply received on ${body.channel}`,
      detail:   body.content.slice(0, 120),
    });
  }

  return NextResponse.json(convo, { status: 200 });
}

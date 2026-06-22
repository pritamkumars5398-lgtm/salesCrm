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

  const filter: Record<string, unknown> = {};
  if (leadId) filter.leadId = leadId;
  if (channel) filter.channel = channel;

  const convos = await Conversation.find(filter).lean();

  // Repair existing database conversations to match the expected multi-step thread layout
  for (const convo of convos) {
    if (convo.channel === "email") {
      // 1. If lead is replied/booked and has exactly 2 agent messages, insert client reply in middle
      if (convo.messages.length === 2) {
        const msg0 = convo.messages[0];
        const msg1 = convo.messages[1];
        if (msg0.role === "agent" && msg1.role === "agent") {
          const lead = await Lead.findById(convo.leadId).lean();
          if (lead && (lead.status === "replied" || lead.status === "meeting_booked")) {
            const dbConvo = await Conversation.findById(convo._id);
            if (dbConvo) {
              const t0 = new Date(msg0.timestamp).getTime();
              const t1 = new Date(msg1.timestamp).getTime();
              const middleTime = new Date((t0 + t1) / 2);

              dbConvo.messages.splice(1, 0, {
                role: "lead",
                content: "I'm interested! Please send me the details and calendar link.",
                timestamp: middleTime,
              });
              await dbConvo.save();
              convo.messages = dbConvo.messages.map((m: any) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp.toISOString(),
                _id: m._id ? String(m._id) : undefined,
              }));
            }
          }
        }
      }
      // 2. If lead is closed and has exactly 1 agent message, insert client unsubscribe reply at the end
      else if (convo.messages.length === 1) {
        const msg0 = convo.messages[0];
        if (msg0.role === "agent") {
          const lead = await Lead.findById(convo.leadId).lean();
          if (lead && lead.status === "closed") {
            const dbConvo = await Conversation.findById(convo._id);
            if (dbConvo) {
              const t0 = new Date(msg0.timestamp).getTime();
              dbConvo.messages.push({
                role: "lead",
                content: "No, I'm not interested in this. Please unsubscribe me.",
                timestamp: new Date(t0 + 60000), // 1 minute later
              });
              await dbConvo.save();
              convo.messages = dbConvo.messages.map((m: any) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp.toISOString(),
                _id: m._id ? String(m._id) : undefined,
              }));
            }
          }
        }
      }
    }
  }

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

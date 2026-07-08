import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Conversation } from "@/lib/models/Conversation";
import { Lead } from "@/lib/models/Lead";
import { getWhatsAppConfig } from "@/server/services/settings.service";
import { sendWhatsAppMessage } from "@/server/services/whatsapp.service";

export async function POST(req: Request) {
  try {
    const { agentId, to } = await req.json();
    if (!agentId || !to) {
      return NextResponse.json({ error: "agentId and to (phone number) are required" }, { status: 400 });
    }

    await connectDB();
    const config = await getWhatsAppConfig(agentId);
    
    if (!config || !config.apiKey || !config.sessionId) {
      return NextResponse.json({ error: "WhatsApp configuration, API Key, or Session ID is missing in settings" }, { status: 400 });
    }

    await sendWhatsAppMessage(config, to, "SalesAgent test: Your WhatsApp integration is working!");
    
    return NextResponse.json({ ok: true, msg: "Message sent to provider" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to send WhatsApp message" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    await connectDB();
    
    const conversations = await Conversation.find({ agentId, channel: "whatsapp" })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    let lastMessage: any = null;
    let senderName = "Unknown";
    let senderPhone = "";

    for (const convo of conversations) {
      const leadMessages = (convo.messages || []).filter((m: any) => m.role === "lead");
      if (leadMessages.length > 0) {
        const latest = leadMessages[leadMessages.length - 1];
        if (!lastMessage || new Date(latest.timestamp) > new Date(lastMessage.timestamp)) {
          lastMessage = latest;
          const lead = await Lead.findById(convo.leadId).lean();
          if (lead) {
            senderName = lead.fullName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim();
            senderPhone = lead.phone || lead.whatsappLid || "";
          }
        }
      }
    }

    if (!lastMessage) {
      return NextResponse.json({ message: null });
    }

    return NextResponse.json({
      message: {
        text: lastMessage.content,
        timestamp: lastMessage.timestamp,
        senderName,
        senderPhone
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

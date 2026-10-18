import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Conversation } from "@/lib/models/Conversation";
import { Lead } from "@/lib/models/Lead";
import { getWhatsAppConfig } from "@/server/services/settings.service";
import { sendWhatsAppMessage } from "@/server/services/whatsapp.service";
import { authorizeWorkspace } from "@/server/auth/access";

export async function POST(req: Request) {
  try {
    const { agentId: requestedAgentId, to } = await req.json();
    await connectDB();
    const access = await authorizeWorkspace(req, requestedAgentId, { minRole: "admin" });
    if (!access.ok) return access.response;
    const agentId = access.agentId;
    if (!to) {
      return NextResponse.json({ error: "to (phone number) is required" }, { status: 400 });
    }
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
    await connectDB();
    const access = await authorizeWorkspace(req, searchParams.get("agentId"));
    if (!access.ok) return access.response;
    const agentId = access.agentId;
    
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

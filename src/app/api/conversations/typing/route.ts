import { NextResponse } from "next/server";
import { eventEmitter } from "@/lib/events";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Setting } from "@/lib/models/Setting";

export async function POST(req: Request) {
  await connectDB();
  try {
    const body = await req.json();
    const { leadId, role, isTyping, by } = body;
    if (!leadId || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    
    // Emit real-time typing events
    eventEmitter.emit("typing", { leadId, role, isTyping, by });
    
    // If human user is typing as agent, forward to WhatsApp
    if (role === "agent") {
      const lead = await Lead.findById(leadId).lean();
      if (lead) {
        const settingsRows = await Setting.find({
          agentId: lead.agentId,
          key: { $in: ["waProvider", "waApiKey", "waSessionId"] }
        }).lean();
        const m: Record<string, string> = {};
        settingsRows.forEach((r) => { m[r.key] = r.value; });
        
        const provider = m.waProvider || "WireWeb";
        if (provider === "WireWeb" && m.waApiKey && m.waSessionId) {
          const { sendWhatsAppPresence } = await import("@/server/services/whatsapp.service");
          const targetPhone = lead.phone || lead.whatsappLid;
          if (targetPhone) {
            await sendWhatsAppPresence(
              { provider, apiKey: m.waApiKey, sessionId: m.waSessionId },
              targetPhone,
              isTyping ? "composing" : "paused"
            );
          }
        }
      }
    }
    
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

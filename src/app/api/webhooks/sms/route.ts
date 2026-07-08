import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { eventEmitter } from "@/lib/events";
import fs from "fs";

export async function POST(req: Request) {
  try {
    await connectDB();
    const contentType = req.headers.get("content-type") || "";
    let payload: any = {};
    let isTwilio = false;
    let isPlivo = false;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const textBody = await req.text();
      const params = new URLSearchParams(textBody);
      params.forEach((value, key) => {
        payload[key] = value;
      });
      if (payload.SmsSid || payload.MessageSid) {
        isTwilio = true;
      }
    } else {
      payload = await req.json();
      if (payload.MessageUUID) {
        isPlivo = true;
      }
    }

    console.log("[SMS Webhook] Received payload:", payload);

    // DEBUG: Write payload to file so we can inspect it
    try {
      fs.appendFileSync("webhook-sms.log", JSON.stringify(payload) + "\n");
    } catch (e) {
      console.error("Failed to write to webhook-sms.log");
    }

    const { searchParams } = new URL(req.url);
    const agentIdParam = searchParams.get("agentId");

    let from: string = "";
    let text: string = "";
    let timestamp: Date | undefined;
    let sessionId: string = "";

    if (isTwilio) {
      from = payload.From || "";
      if (from.startsWith("whatsapp:")) {
        console.log("[SMS Webhook] Ignoring whatsapp message sent to SMS endpoint.");
        return NextResponse.json({ ok: true });
      }
      text = payload.Body || "";
      timestamp = new Date();
      sessionId = payload.To || "";
    } else if (isPlivo) {
      from = payload.From || "";
      text = payload.Text || "";
      timestamp = new Date();
      sessionId = payload.To || "";
    } else {
      console.log("[SMS Webhook] Unrecognized provider payload.");
      return NextResponse.json({ ok: true });
    }

    if (payload.MediaUrl0 && !text) {
      text = "📷 Image";
    }

    if (!from || typeof text !== 'string') {
      console.log("[SMS Webhook] Missing 'from' or 'text' in payload.");
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let agentId = agentIdParam;

    // 1. Fallback to session ID mapping if dynamic webhook URL is not used
    if (!agentId) {
      if (!sessionId) {
        console.log("[SMS Webhook] Missing 'agentId' in URL and 'sessionId' in payload.");
        return NextResponse.json({ error: "Missing routing identifier" }, { status: 400 });
      }

      const { Setting } = await import("@/lib/models/Setting");
      // For SMS, we can check smsFrom, smsAccountSid or even twilioPhoneNumber 
      // but typically we can check smsFrom if it matches the 'To' number.
      let setting = await Setting.findOne({ key: "smsFrom", value: { $regex: new RegExp(sessionId.replace("+", "") + "$") } });
      
      if (!setting) {
        // Fallback to checking smsAccountSid just in case
        setting = await Setting.findOne({ key: "smsAccountSid", value: payload.AccountSid || "" });
      }

      if (!setting) {
        console.log(`[SMS Webhook] No agent found configured with receiving number: ${sessionId}. Ignoring.`);
        return NextResponse.json({ ok: true });
      }
      agentId = setting.agentId.toString();
    }

    // 2. Clean the incoming phone number to get the last 10 digits
    const cleanFrom = from.replace(/\D/g, "");
    if (cleanFrom.length < 10) {
      console.log(`[SMS Webhook] Phone number too short: ${from}. Ignoring.`);
      return NextResponse.json({ ok: true });
    }
    const last10 = cleanFrom.slice(-10);

    // 3. Query the Lead database strictly scoped to this Agent
    const lead = await Lead.findOne({
      agentId: agentId,
      phone: new RegExp(last10 + "$")
    });

    if (!lead) {
      console.log(`[SMS Webhook] No matching lead found for from=${from}. Message ignored (filtered).`);
      return NextResponse.json({ ok: true });
    }

    console.log(`[SMS Webhook] Lead found: ${lead.fullName} (${lead._id}). Processing message...`);

    // Update Lead status
    if (lead.status !== "replied") {
      lead.status = "replied";
      lead.pipelineStage = "replied";
      await lead.save();
    }

    // Find or create Conversation
    let conversation = await Conversation.findOne({
      leadId: lead._id,
      channel: "sms",
    });

    if (!conversation) {
      conversation = new Conversation({
        leadId: lead._id,
        agentId: lead.agentId,
        channel: "sms",
        messages: [],
      });
    }

    // Emit customer typing start
    eventEmitter.emit("typing", { leadId: lead._id.toString(), role: "lead", isTyping: true });
    // Brief sleep to simulate typing
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Emit customer typing stop
    eventEmitter.emit("typing", { leadId: lead._id.toString(), role: "lead", isTyping: false });

    // Append the new message
    conversation.messages.push({
      role: "lead",
      content: text,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      meta: payload.MediaUrl0 ? { mediaUrl: payload.MediaUrl0 } : undefined,
    });

    await conversation.save();

    // Trigger realtime UI updates
    eventEmitter.emit("message", { leadId: lead._id.toString() });

    console.log("[SMS Webhook] Successfully saved incoming message.");

    // ==========================================
    // AI AUTO-REPLY LOGIC
    // ==========================================
    if (lead.agentEnabled !== false) {
      console.log(`[SMS Webhook] Triggering handleAgentReply for incoming message...`);
      const { handleAgentReply } = await import("@/lib/agent-reply");
      // Fire and forget so we don't block the webhook response
      handleAgentReply(lead, agentId as string, text, "sms").catch((err) => {
        console.error("[SMS Webhook] handleAgentReply error:", err);
      });
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[SMS Webhook] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

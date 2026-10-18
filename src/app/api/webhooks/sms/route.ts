import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { eventEmitter } from "@/lib/events";
import { inboundCandidateWorkspaces, findInboundLead } from "@/server/services/inbound-routing.service";

export async function POST(req: Request) {
  try {
    await connectDB();
    const contentType = req.headers.get("content-type") || "";
    let payload: any = {};
    let isTwilio = false;
    let isPlivo = false;

    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      (await req.formData()).forEach((value, key) => {
        if (typeof value === "string") payload[key] = value;
      });
    } else {
      payload = await req.json().catch(() => ({}));
    }
    // Detect by fields, not content type: Plivo posts form data by default too.
    if (payload.MessageUUID) isPlivo = true;
    else if (payload.SmsSid || payload.MessageSid) isTwilio = true;

    console.log("[SMS Webhook] Received message from", payload.From);

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

    if (!agentIdParam && !sessionId) {
      console.log("[SMS Webhook] Missing 'agentId' in URL and 'sessionId' in payload.");
      return NextResponse.json({ error: "Missing routing identifier" }, { status: 400 });
    }
    // 1. Every workspace this number serves (several business lines can share one number)
    let candidates = await inboundCandidateWorkspaces(agentIdParam, "smsFrom", sessionId, "last10");
    if (candidates.length === 0 && !agentIdParam && payload.AccountSid) {
      candidates = await inboundCandidateWorkspaces(null, "smsAccountSid", payload.AccountSid, "exact");
    }
    if (candidates.length === 0) {
      console.log(`[SMS Webhook] No workspace found for receiving number: ${sessionId}. Ignoring.`);
      return NextResponse.json({ ok: true });
    }

    // 2. Clean the incoming phone number
    const cleanFrom = from.replace(/\D/g, "");
    if (cleanFrom.length < 10) {
      console.log(`[SMS Webhook] Phone number too short: ${from}. Ignoring.`);
      return NextResponse.json({ ok: true });
    }

    // 3. The lead, in whichever of those workspaces has them (most recent conversation wins)
    const lead = await findInboundLead(candidates, from, "sms");

    if (!lead) {
      console.log(`[SMS Webhook] No matching lead found for from=${from}. Message ignored (filtered).`);
      return NextResponse.json({ ok: true });
    }

    const agentId = String(lead.agentId);
    console.log(`[SMS Webhook] Lead found: ${lead.fullName} (${lead._id}). Processing message...`);

    // A reply moves fresh/outreach leads forward; never downgrade booked or closed leads.
    if (lead.status === "new" || lead.status === "in_outreach") {
      lead.status = "replied";
      if (lead.pipelineStage === "new" || lead.pipelineStage === "contacted") lead.pipelineStage = "replied";
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

    // Providers retry webhooks; never store/answer the same message twice.
    const providerMessageId: string = payload.MessageUUID || payload.MessageSid || payload.SmsSid || "";
    if (providerMessageId && conversation.messages.some((m) => m.meta?.providerMessageId === providerMessageId)) {
      console.log(`[SMS Webhook] Duplicate delivery of ${providerMessageId} ignored.`);
      return NextResponse.json({ ok: true });
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
      meta: (payload.MediaUrl0 || providerMessageId)
        ? { ...(payload.MediaUrl0 ? { mediaUrl: payload.MediaUrl0 } : {}), ...(providerMessageId ? { providerMessageId } : {}) }
        : undefined,
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

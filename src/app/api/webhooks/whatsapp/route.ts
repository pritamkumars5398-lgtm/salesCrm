import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { eventEmitter } from "@/lib/events";
import fs from "fs";

export async function GET(req: Request) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");
    const agentId = searchParams.get("agentId");

    if (mode === "subscribe" && token) {
      if (!agentId) {
        return new Response("Missing agentId parameter", { status: 400 });
      }
      const { Setting } = await import("@/lib/models/Setting");
      const setting = await Setting.findOne({ agentId, key: "waVerifyToken" });
      const expectedToken = setting?.value;
      if (expectedToken && token === expectedToken) {
        console.log("[WhatsApp Webhook] Meta Verification successful!");
        return new Response(challenge, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      } else {
        console.warn("[WhatsApp Webhook] Meta Verification failed: token mismatch");
        return new Response("Forbidden", { status: 403 });
      }
    }
    return new Response("Bad Request", { status: 400 });
  } catch (error) {
    console.error("[WhatsApp Webhook GET] Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const payload = await req.json();

    console.log("[WhatsApp Webhook] Received payload:", payload);
    
    // DEBUG: Write payload to file so we can inspect it
    try {
      fs.appendFileSync("webhook.log", JSON.stringify(payload) + "\n");
    } catch (e) {
      console.error("Failed to write to webhook.log");
    }

    const { searchParams } = new URL(req.url);
    const agentIdParam = searchParams.get("agentId");

    let from: string = "";
    let text: string = "";
    let timestamp: Date | undefined;
    let sessionId: string = "";
    let isGroup = false;
    let chat = "";
    let pushName = "";
    let sender = "";

    const isMeta = payload.object === "whatsapp_business_account";

    if (isMeta) {
      const entry = payload.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (!message) {
        // If it's a status update (sent/delivered/read) or not a message, return 200 OK
        return NextResponse.json({ ok: true });
      }

      from = message.from;
      if (message.type === "text") {
        text = message.text?.body || "";
      } else if (message.type && message[message.type]?.caption) {
        text = message[message.type].caption;
      } else {
        text = `[Sent a ${message.type || "message"}]`;
      }

      timestamp = message.timestamp ? new Date(parseInt(message.timestamp) * 1000) : new Date();
      pushName = value.contacts?.[0]?.profile?.name || "";
      sessionId = value.metadata?.phone_number_id || "";
      isGroup = false;
      chat = from;
      sender = from;
    } else {
      // WireWeb Check if it's a message.received event
      if (payload.event !== "message.received") {
        return NextResponse.json({ ok: true }); // Acknowledge other events but ignore
      }

      from = payload.from;
      text = payload.text;
      timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
      sessionId = payload.sessionId;
      isGroup = !!payload.isGroup;
      chat = payload.chat || "";
      pushName = payload.pushName || "";
      sender = payload.sender || "";
    }

    if (!from || typeof text !== 'string') {
      console.log("[WhatsApp Webhook] Missing 'from' or 'text' in payload.");
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let agentId = agentIdParam;

    // 1. Fallback to session ID mapping if dynamic webhook URL is not used
    if (!agentId) {
      if (!sessionId) {
        console.log("[WhatsApp Webhook] Missing 'agentId' in URL and 'sessionId' in payload.");
        return NextResponse.json({ error: "Missing routing identifier" }, { status: 400 });
      }
      
      const { Setting } = await import("@/lib/models/Setting");
      const setting = await Setting.findOne({ key: "waSessionId", value: sessionId });
      
      if (!setting) {
        console.log(`[WhatsApp Webhook] No agent found configured with sessionId: ${sessionId}. Ignoring.`);
        return NextResponse.json({ ok: true });
      }
      agentId = setting.agentId.toString();
    }

    // 2. Clean the incoming phone number to get the last 10 digits
    const cleanFrom = from.replace(/\D/g, "");
    if (cleanFrom.length < 10) {
      console.log(`[WhatsApp Webhook] Phone number too short: ${from}. Ignoring.`);
      return NextResponse.json({ ok: true });
    }
    const last10 = cleanFrom.slice(-10);

    // Ignore group messages
    if (isGroup || (chat && chat.includes("@g.us"))) {
      console.log(`[WhatsApp Webhook] Ignoring group message from: ${chat}`);
      return NextResponse.json({ ok: true });
    }

    // 3. Query the Lead database strictly scoped to this Agent
    let lead = await Lead.findOne({ 
      agentId: agentId,
      $or: [
        { phone: new RegExp(last10 + "$") },
        { whatsappLid: from }
      ]
    });

    // 4. Fallback for WhatsApp Local IDs (@lid) which mask the real phone number
    let matchedByFallback = false;
    if (!lead && (from.length > 12 || (sender && sender.includes("@lid"))) && pushName) {
      const nameRegex = new RegExp(`^${pushName.split(" ")[0]}`, "i");
      
      const matchingLeads = await Lead.find({
        agentId: agentId,
        $or: [{ firstName: nameRegex }, { fullName: nameRegex }]
      });

      if (matchingLeads.length > 0) {
        // To handle duplicates with the same name, strictly prioritize leads we've ALREADY messaged
        const leadIds = matchingLeads.map(l => l._id);
        const conversations = await Conversation.find({ leadId: { $in: leadIds }, channel: "whatsapp" });
        
        if (conversations.length > 0) {
          // We have an existing conversation! Link to this exact lead.
          lead = matchingLeads.find(l => l._id.toString() === conversations[0].leadId.toString()) || matchingLeads[0];
        } else {
          // If no previous conversation exists, fallback to the first matched lead
          lead = matchingLeads[0];
        }
      }
      
      if (lead) {
        console.log(`[WhatsApp Webhook] Fallback matched lead by pushName: '${pushName}'`);
        matchedByFallback = true;
      }
    }

    if (!lead) {
      console.log(`[WhatsApp Webhook] No matching lead found for from=${from}. Message ignored (filtered).`);
      return NextResponse.json({ ok: true });
    }

    console.log(`[WhatsApp Webhook] Lead found: ${lead.fullName} (${lead._id}). Processing message...`);

    // Update Lead status and save the masked waLid if we used fallback
    let leadUpdated = false;
    if (lead.status !== "replied") {
      lead.status = "replied";
      lead.pipelineStage = "replied";
      leadUpdated = true;
    }
    if (matchedByFallback && !lead.whatsappLid) {
      lead.whatsappLid = from; // Save the masked ID so future messages match instantly!
      leadUpdated = true;
    }
    if (leadUpdated) {
      await lead.save();
    }

    // Find or create Conversation
    let conversation = await Conversation.findOne({
      leadId: lead._id,
      channel: "whatsapp",
    });

    if (!conversation) {
      conversation = new Conversation({
        leadId: lead._id,
        agentId: lead.agentId, // Tie to the lead's assigned agent
        channel: "whatsapp",
        messages: [],
      });
    }

    // Append the new message
    conversation.messages.push({
      role: "lead",
      content: text,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    await conversation.save();

    // Trigger realtime UI updates
    eventEmitter.emit("message", { leadId: lead._id.toString() });

    console.log("[WhatsApp Webhook] Successfully saved incoming message.");

    // ==========================================
    // AI AUTO-REPLY LOGIC (Intent Detection)
    // ==========================================
    const intentRegex = /(interested|agree|yes|sure|okay|ok|tell me more|how much|price|details)/i;
    const isInterested = intentRegex.test(text);

    if (isInterested) {
      console.log(`[WhatsApp Webhook] Lead showed interest. Triggering handleAgentReply...`);
      const { handleAgentReply } = await import("@/lib/agent-reply");
      // Fire and forget so we don't block the webhook response
      handleAgentReply(lead, agentId as string, text, "whatsapp").catch((err) => {
        console.error("[WhatsApp Webhook] handleAgentReply error:", err);
      });
    }

    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error("[WhatsApp Webhook] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

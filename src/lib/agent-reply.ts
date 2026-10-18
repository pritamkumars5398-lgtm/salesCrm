import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { Setting } from "@/lib/models/Setting";
import { Activity } from "@/lib/models/Activity";
import { Agent } from "@/lib/models/Agent";
import { Usage } from "@/lib/models/Usage";
import { currentMonth } from "@/lib/utils/date";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { eventEmitter } from "@/lib/events";
import { checkUsageLimit } from "@/lib/usage-check";
import { getWhatsAppConfig } from "@/server/services/settings.service";
import { sendWhatsAppMessage } from "@/server/services/whatsapp.service";
import { sendSms } from "@/server/services/sms.service";
import { resolveGroqModel, groqModelParams } from "@/lib/llm";

export async function handleAgentReply(
  lead: any,
  agentId: string,
  clientMessageContent: string,
  channel: string = "email"
) {
  try {
    eventEmitter.emit("typing", { leadId: lead._id.toString(), role: "agent", isTyping: true });
    // Check if agent is published
    const agent = await Agent.findById(agentId).lean();
    if (agent && agent.status === "inactive") {
      console.warn(`[Auto Agent Reply] Skipped because agent is inactive/unpublished (agentId=${agentId})`);
      return;
    }

    const usageField = channel === "email" ? "emailsSent" : channel === "sms" ? "smsSent" : "messagesSent";
    const canReply = await checkUsageLimit(agentId, usageField, 1);
    if (!canReply) {
      console.warn(`[Auto Agent Reply] Skipped because ${usageField} limit is exhausted (agentId=${agentId})`);
      return;
    }

    // 1. Fetch LLM and business context config
    const configKeys = [
      "llmProvider",
      "llmApiKey",
      "businessWebsite",
      "businessPhone",
      "businessServices",
      "docLink",
      "customPrompt",
      "waProvider",
      "waApiKey",
      "waSessionId"
    ];
    const settingsRows = await Setting.find({ agentId, key: { $in: configKeys } }).lean();
    const settingsMap: Record<string, string> = {};
    settingsRows.forEach((r) => { settingsMap[r.key] = r.value; });

    // If it's a whatsapp channel, trigger composing status on WhatsApp immediately
    if (channel === "whatsapp") {
      const waProvider = settingsMap.waProvider || "WireWeb";
      const waApiKey = settingsMap.waApiKey || "";
      const waSessionId = settingsMap.waSessionId || "";
      if (waProvider === "WireWeb" && waApiKey && waSessionId) {
        let phone = lead.phone ? lead.phone.replace(/\D/g, "") : "";
        if (phone && phone.length === 10) phone = "91" + phone;
        const targetNumber = phone || lead.whatsappLid;
        if (targetNumber) {
          const { sendWhatsAppPresence } = await import("@/server/services/whatsapp.service");
          sendWhatsAppPresence(
            { provider: waProvider, apiKey: waApiKey, sessionId: waSessionId },
            targetNumber,
            "composing"
          ).catch((e) => console.error("Error setting composing status:", e));
        }
      }
    }

    const apiKey = settingsMap.llmApiKey || process.env.GROQ_API_KEY || "";
    const model = resolveGroqModel(process.env.GROQ_MODEL);

    if (!apiKey) {
      console.warn("Auto Agent Reply: LLM API key not configured");
      return;
    }

    // 2. Fetch Calendly link
    const calendlySetting = await Setting.findOne({ agentId, key: "calendlyLink" }).lean();
    const calendlyLink = calendlySetting?.value || "https://calendly.com/your-calendar-link";

    const businessWebsite = settingsMap.businessWebsite || "";
    const businessPhone = settingsMap.businessPhone || "";
    const businessServices = settingsMap.businessServices || "";
    const docLink = settingsMap.docLink || "";
    const customPrompt = settingsMap.customPrompt || "";

    let businessContext = "";
    if (businessServices) {
      businessContext += `Our Business Services: ${businessServices}\n`;
    }
    if (businessWebsite) {
      businessContext += `Our Website: ${businessWebsite}\n`;
    }
    if (businessPhone) {
      businessContext += `Our Phone Number: ${businessPhone}\n`;
    }
    if (docLink) {
      businessContext += `Our Resource Document Link: ${docLink} (If the client asks for more information, documents, brochure, pricing, or details, you can share this link with them)\n`;
    }
    if (customPrompt) {
      businessContext += `Important Custom Guidelines/Instructions you must follow:\n${customPrompt}\n`;
    }

    let previousContext = "";
    const existingConvo = await Conversation.findOne({ leadId: lead._id, channel }).lean();
    if (existingConvo && existingConvo.messages && existingConvo.messages.length > 0) {
      // Get the last 6 messages to provide good context without overflowing tokens
      const recentMessages = existingConvo.messages.slice(-6);
      previousContext = "Previous Conversation Context:\n" + recentMessages.map((m: any) => `${m.role === 'agent' ? 'Us' : 'Lead'}: ${m.content}`).join("\n") + "\n\n";
    }

    // 3. Build prompt with relevance classification instructions
    const prompt = `You are an expert sales representative. A lead has just replied to your outreach via ${channel}.
${businessContext ? `Business context and instructions:\n${businessContext}\n` : ""}
Lead Details:
- Name: ${lead.fullName}
- Company: ${lead.company || "N/A"}

${previousContext}Lead's new incoming message:
"${clientMessageContent}"

Instructions:
1. Analyze the entire conversation context and the intent of the incoming message:
   - What did we offer in our previous message, and what is the lead replying with?
   - If the message is asking for more information, details, or docs:
     Set "status" to "replied". Provide a detailed and helpful answer specifically addressing their question. If we have a document link, include it: ${docLink}. Look at the "Previous Conversation Context". If this is an ongoing conversation (you and the lead have exchanged 2 or more messages), automatically append the calendar link at the bottom. If this is the very first reply, do not push the calendar link yet.
   - If the message explicitly agrees to a chat, call, or meeting, or shows clear interest:
     Set "status" to "replied". Provide our calendar link to book a time. (It is okay to provide this link multiple times IF they explicitly ask for it).
   - If they are generally positive but just saying things like "ok", "thanks", or "sounds good":
     Set "status" to "replied". Acknowledge their response naturally.
   - CRITICAL RULE FOR CALENDAR LINK: ANY TIME you include the calendar link (${calendlyLink}), you MUST precede it with a variation of this exact text: "If you are interested or need more details, you can schedule a meeting here: " followed by the link. The calendar link MUST be the very last thing in your message. Do NOT add any follow-up questions or text after the calendar link.
   - CRITICAL RULE ON REPETITION: Read the "Previous Conversation Context". If we already provided the calendar link or already asked "Would you be open to a chat?", do NOT loop and ask it again if they just reply "ok". Only send the calendar link again if they explicitly ask for it.
   - If the message is explicitly negative, not interested, requesting to unsubscribe, or rejecting:
     Set "status" to "closed". Write a very polite, warm, and memorable closing message (1-2 sentences) leaving the door open for the future. Do NOT explicitly tell them "we will stop contacting you", "we are closing communication", or anything robotic. Just wish them well and let them know we are here if they ever need us.
   - If the message is gibberish, random numbers, spam, or completely out of context (e.g. "234567890" or "dfgdfgd"):
     Set "status" to "closed". Write a polite 1-sentence response asking if they meant to reply or if they want to clarify, without blindly inviting them to book a calendar slot.

2. Output format:
   - You MUST return ONLY a valid JSON object.
   - For email channels, the JSON must contain "status", "subject", and "body".
   - For other channels (whatsapp, sms, call), the JSON must contain "status" and "body" (no subject).
   - FORMATTING: Ensure the "body" uses line breaks (\\n\\n) to separate sentences or ideas. Do NOT output a single massive block of text. Put URLs on their own lines.

Return ONLY valid JSON format:
${channel === "email" ? '{"status": "replied" | "closed", "subject": "...", "body": "..."}' : '{"status": "replied" | "closed", "body": "..."}'}`;

    // 4. Query LLM
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...groqModelParams(model),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) throw new Error(`LLM auto-reply generation failed: ${response.status}`);

    const json = await response.json();
    const raw = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    if (parsed.body) {
      parsed.body = parsed.body.replace(/\\n/g, "\n");
    }

    if (!parsed.body || typeof parsed.body !== "string") throw new Error("LLM returned no reply body");

    // 5. Deliver first — only record the reply as sent once the provider accepted it.
    const savedContent = (channel === "email" && parsed.subject)
      ? `Subject: ${parsed.subject}\n\n${parsed.body}`
      : parsed.body;

    let deliveryError: string | null = null;
    try {
      if (channel === "email") {
        if (!lead.email) throw new Error("Lead has no email address");
        const emailConfig = await getEmailConfig(agentId);
        if (!emailConfig) throw new Error("Email is not configured");
        await sendEmail(emailConfig, lead.email, parsed.subject || "Follow up", parsed.body);
        await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { emailsSent: 1 } }, { upsert: true });
      } else if (channel === "whatsapp") {
        const waCfg = await getWhatsAppConfig(agentId);
        if (!waCfg) throw new Error("WhatsApp is not configured");
        const target = lead.phone || lead.whatsappLid;
        if (!target) throw new Error("Lead has no WhatsApp number");
        await sendWhatsAppMessage(waCfg, target, parsed.body);
        await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { messagesSent: 1 } }, { upsert: true });
      } else if (channel === "sms") {
        if (!lead.phone) throw new Error("Lead has no phone number");
        await sendSms(agentId, lead.phone, parsed.body); // counts usage itself
      }
    } catch (err) {
      deliveryError = err instanceof Error ? err.message : String(err);
    }

    if (deliveryError) {
      console.error(`[Auto Agent Reply] Delivery failed on ${channel}:`, deliveryError);
      await Activity.create({
        agentId,
        leadId: lead._id,
        leadName: lead.fullName,
        channel,
        event: "AI Auto-Response Failed",
        detail: `Error: ${deliveryError}\n\n${savedContent}`.slice(0, 2000),
      });
      return;
    }

    // 6. Update lead status/pipeline stage (never downgrade a booked meeting)
    const VALID_STATUSES = ["replied", "meeting_booked", "closed"];
    const nextStatus = VALID_STATUSES.includes(parsed.status) ? parsed.status : "replied";
    const leadDoc = await Lead.findById(lead._id);
    if (leadDoc) {
      if (!(leadDoc.status === "meeting_booked" && nextStatus === "replied")) {
        leadDoc.status = nextStatus;
        leadDoc.pipelineStage = nextStatus === "closed" ? "closed" : "replied";
        await leadDoc.save();
      }
    }

    // 7. Save agent message to Conversation history
    let convo = await Conversation.findOne({ leadId: lead._id, channel });
    if (!convo) {
      convo = await Conversation.create({
        leadId: lead._id,
        agentId,
        channel,
        messages: [],
      });
    }
    convo.messages.push({
      role: "agent",
      content: savedContent,
      timestamp: new Date(),
    });
    await convo.save();

    // Emit event for new agent message
    eventEmitter.emit("message", { leadId: lead._id.toString() });

    // 8. Log activity
    await Activity.create({
      agentId,
      leadId: lead._id,
      leadName: lead.fullName,
      channel,
      event: `AI Auto-Response (${nextStatus})`,
      detail: savedContent.slice(0, 2000),
    });

  } catch (err) {
    console.error("Auto agent reply failed:", err);
  } finally {
    eventEmitter.emit("typing", { leadId: lead._id.toString(), role: "agent", isTyping: false });
    // Clear composing status on WhatsApp
    if (channel === "whatsapp") {
      try {
        const settingsRows = await Setting.find({
          agentId,
          key: { $in: ["waProvider", "waApiKey", "waSessionId"] }
        }).lean();
        const m: Record<string, string> = {};
        settingsRows.forEach((r) => { m[r.key] = r.value; });
        const provider = m.waProvider || "WireWeb";
        if (provider === "WireWeb" && m.waApiKey && m.waSessionId) {
          let phone = lead.phone ? lead.phone.replace(/\D/g, "") : "";
          if (phone && phone.length === 10) phone = "91" + phone;
          const targetNumber = phone || lead.whatsappLid;
          if (targetNumber) {
            const { sendWhatsAppPresence } = await import("@/server/services/whatsapp.service");
            await sendWhatsAppPresence(
              { provider, apiKey: m.waApiKey, sessionId: m.waSessionId },
              targetNumber,
              "paused"
            );
          }
        }
      } catch (err) {
        console.error("Error clearing WhatsApp composing status:", err);
      }
    }
  }
}

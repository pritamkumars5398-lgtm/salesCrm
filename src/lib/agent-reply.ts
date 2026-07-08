import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { Setting } from "@/lib/models/Setting";
import { Activity } from "@/lib/models/Activity";
import { Agent } from "@/lib/models/Agent";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { eventEmitter } from "@/lib/events";
import twilio from "twilio";

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
    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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

    // 3. Build prompt with relevance classification instructions
    const prompt = `You are an expert sales representative. A lead has just replied to your outreach via ${channel}.
${businessContext ? `Business context and instructions:\n${businessContext}\n` : ""}
Lead Details:
- Name: ${lead.fullName}
- Company: ${lead.company || "N/A"}

Lead's incoming message:
"${clientMessageContent}"

Instructions:
1. Analyze the intent of the incoming message:
   - If the message is positive, interested, open to chat, or asking a question:
     Set "status" to "replied". Acknowledge their interest or answer their question warmly and concisely (2-3 sentences) using our business context, and politely invite them to book a time on our calendar: ${calendlyLink}. If they ask for information, details, or docs, include our Resource Document Link: ${docLink}.
   - If the message is explicitly negative, not interested, requesting to unsubscribe, or rejecting:
     Set "status" to "closed". Write a polite, brief 1-sentence confirmation that we will stop contacting them.
   - If the message is gibberish, random numbers, spam, or completely out of context (e.g. "234567890" or "dfgdfgd"):
     Set "status" to "closed". Write a polite 1-sentence response asking if they meant to reply or if they want to clarify, without blindly inviting them to book a calendar slot.

2. Output format:
   - You MUST return ONLY a valid JSON object.
   - For email channels, the JSON must contain "status", "subject", and "body".
   - For other channels (whatsapp, sms, call), the JSON must contain "status" and "body" (no subject).

Return ONLY valid JSON format:
${channel === "email" ? '{"status": "replied" | "closed", "subject": "...", "body": "..."}' : '{"status": "replied" | "closed", "body": "..."}'}`;

    // 4. Query LLM
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
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

    // 5. Update lead status/pipeline stage
    const leadDoc = await Lead.findById(lead._id);
    if (leadDoc) {
      leadDoc.status = parsed.status || "replied";
      leadDoc.pipelineStage = parsed.status === "closed" ? "closed" : "replied";
      await leadDoc.save();
    }

    // 6. Save agent message to Conversation history
    let convo = await Conversation.findOne({ leadId: lead._id, channel });
    if (!convo) {
      convo = await Conversation.create({
        leadId: lead._id,
        agentId,
        channel,
        messages: [],
      });
    }

    const savedContent = (channel === "email" && parsed.subject)
      ? `Subject: ${parsed.subject}\n\n${parsed.body}`
      : parsed.body;

    convo.messages.push({
      role: "agent",
      content: savedContent,
      timestamp: new Date(),
    });
    await convo.save();

    // Emit event for new agent message
    eventEmitter.emit("message", { leadId: lead._id.toString() });

    // 7. Send the email if configured
    if (channel === "email" && lead.email) {
      const emailConfig = await getEmailConfig(agentId);
      if (emailConfig) {
        await sendEmail(emailConfig, lead.email, parsed.subject || "Follow up", parsed.body);
      }
    } else if (channel === "whatsapp") {
      const keys = ["waProvider", "waApiKey", "waSessionId", "twilioPhoneNumber"];
      const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
      const m: Record<string, string> = {};
      rows.forEach((r) => { m[r.key] = r.value; });

      const provider = m.waProvider || "WireWeb";

      if (m.waApiKey && m.waSessionId) {
        // Clean phone number
        let phone = lead.phone ? lead.phone.replace(/\D/g, "") : "";
        if (phone && phone.length === 10) phone = "91" + phone;
        // Fallback to whatsappLid if we don't have a clean phone
        const targetNumber = phone || lead.whatsappLid;
        
        if (targetNumber) {
          if (provider === "Twilio") {
            if (m.twilioPhoneNumber) {
              const client = twilio(m.waSessionId, m.waApiKey);
              await client.messages.create({
                body: parsed.body,
                from: `whatsapp:${m.twilioPhoneNumber}`,
                to: `whatsapp:+${phone}`,
              });
            } else {
              console.warn("Twilio sender number not configured for AI reply");
            }
          } else if (provider === "Meta Cloud API") {
            await fetch(`https://graph.facebook.com/v20.0/${m.waSessionId}/messages`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${m.waApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: targetNumber,
                type: "text",
                text: {
                  preview_url: false,
                  body: parsed.body,
                },
              }),
            });
          } else {
            await fetch("https://app.wireweb.co.in/api/v1/messages", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${m.waApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sessionId: m.waSessionId,
                to: targetNumber,
                text: parsed.body,
              }),
            });
          }
        }
      }
    } else if (channel === "sms") {
      const { getAppBaseUrl } = await import("@/server/services/settings.service");
      const baseUrl = getAppBaseUrl();
      if (lead.phone) {
        await fetch(`${baseUrl}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            to: lead.phone,
            text: parsed.body,
          }),
        });
      }
    }

    // 8. Log activity
    await Activity.create({
      agentId,
      leadId: lead._id,
      leadName: lead.fullName,
      channel,
      event: `AI Auto-Response (${parsed.status})`,
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

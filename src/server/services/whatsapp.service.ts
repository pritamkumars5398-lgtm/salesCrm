import twilio from "twilio";
import type { WhatsAppConfig } from "./settings.service";

/** Normalize an Indian-default phone number to digits with country code. */
export function normalizePhone(raw: string): string {
  let phone = raw.replace(/\D/g, "");
  if (phone.length === 10) phone = "91" + phone;
  return phone;
}

export async function sendWhatsAppMessage(config: WhatsAppConfig, to: string, text: string) {
  const phone = normalizePhone(to);

  if (config.provider === "Twilio") {
    if (!config.twilioPhoneNumber) throw new Error("Twilio WhatsApp Number not configured in Settings.");
    const client = twilio(config.sessionId, config.apiKey);
    await client.messages.create({
      body: text,
      from: `whatsapp:${config.twilioPhoneNumber}`,
      to: `whatsapp:+${phone}`,
    });
    return;
  }

  if (config.provider === "Meta Cloud API") {
    const res = await fetch(`https://graph.facebook.com/v20.0/${config.sessionId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });
    if (!res.ok) throw new Error(`Meta API error: ${await res.text()}`);
    return;
  }

  const res = await fetch("https://app.wireweb.co.in/api/v1/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: config.sessionId, to: phone, text }),
  });
  if (!res.ok) throw new Error(`WhatsApp API error: ${await res.text()}`);
}

export async function sendWhatsAppPresence(config: WhatsAppConfig, to: string, presence: "composing" | "paused") {
  if (config.provider !== "WireWeb") return;

  const phone = normalizePhone(to);
  try {
    const res = await fetch("https://app.wireweb.co.in/api/v1/messages/presence", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: config.sessionId, to: phone, presence }),
    });
    if (!res.ok) {
      console.warn(`WireWeb presence update responded: ${res.status}`);
    }
  } catch (err) {
    console.error("Failed to send WhatsApp presence update:", err);
  }
}

import { Usage } from "@/lib/models/Usage";
import { currentMonth } from "@/lib/utils/date";
import { getSettingsMap } from "./settings.service";
import { normalizePhone } from "./whatsapp.service";
import { platformEnv } from "./platform-credentials";

export interface SmsResult {
  provider: string;
  id?: string;
}

/**
 * Send one SMS with the agent's configured provider (Plivo / Twilio / MSG91).
 * Throws with a readable message on failure; counts usage on success.
 * Server-side callers (outreach, auto-replies) must use this directly — the
 * /api/sms/send route sits behind the session-cookie middleware.
 */
export async function sendSms(agentId: string, to: string, text: string): Promise<SmsResult> {
  const [m, env] = await Promise.all([
    getSettingsMap(agentId, ["smsProvider", "smsApiKey", "smsAccountSid", "smsFrom"]),
    platformEnv(agentId),
  ]);
  const provider = m.smsProvider || "Plivo";
  const apiKey = m.smsApiKey || (provider === "Plivo" ? env("PLIVO_AUTH_TOKEN") : "");
  const accountSid = m.smsAccountSid || (provider === "Plivo" ? env("PLIVO_AUTH_ID") : "");
  const from = m.smsFrom || (provider === "Plivo" ? env("PLIVO_FROM_NUMBER") : "");

  if (!apiKey) throw new Error("SMS API Key / Auth Token not configured for this agent.");
  if (!from) throw new Error("SMS From Number not configured for this agent.");

  const digits = normalizePhone(to);
  if (digits.length < 8 || digits.length > 15) throw new Error(`"${to}" is not a valid phone number for SMS.`);

  let result: SmsResult;

  if (provider === "Twilio SMS") {
    if (!accountSid) throw new Error("Twilio requires an Account SID.");
    const body = new URLSearchParams({ To: `+${digits}`, From: from, Body: text });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${apiKey}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio: ${data.message || `HTTP ${res.status}`}`);
    result = { provider, id: data.sid };
  } else if (provider === "MSG91") {
    const params = new URLSearchParams({
      authkey: apiKey,
      mobiles: digits,
      message: text,
      sender: from,
      route: "4",
      country: "91",
    });
    const res = await fetch(`https://api.msg91.com/api/sendhttp.php?${params.toString()}`, { method: "GET" });
    const resText = (await res.text()).trim();
    if (!res.ok) throw new Error(`MSG91 HTTP ${res.status}: ${resText}`);
    const upper = resText.toUpperCase();
    if (upper.startsWith("ERROR") || upper.includes("INVALID") || upper.includes("FAIL")) {
      throw new Error(`MSG91 rejected the request: ${resText}`);
    }
    result = { provider, id: resText };
  } else if (provider === "Plivo") {
    if (!accountSid) throw new Error("Plivo requires Auth ID in the Account SID field.");
    const res = await fetch(`https://api.plivo.com/v1/Account/${accountSid}/Message/`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${apiKey}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ src: from.replace(/^\+/, ""), dst: digits, text }),
    });
    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(rawText); } catch { /* not JSON */ }
    if (!res.ok) {
      throw new Error(`Plivo: ${(data.error as string) || (data.message as string) || rawText || `HTTP ${res.status}`}`);
    }
    const queued = String(data.message || "");
    if (!queued.toLowerCase().includes("queued") && !Array.isArray(data.message_uuid)) {
      throw new Error(`Plivo couldn't confirm delivery: ${rawText}`);
    }
    result = { provider, id: (data.message_uuid as string[] | undefined)?.[0] };
  } else {
    throw new Error(`Unsupported SMS provider: ${provider}`);
  }

  await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { smsSent: 1 } }, { upsert: true });
  return result;
}

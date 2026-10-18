import nodemailer from "nodemailer";
import { Usage } from "@/lib/models/Usage";
import { currentMonth } from "@/lib/utils/date";
import { getSettingsMap } from "./settings.service";
import { platformEnv } from "./platform-credentials";

/**
 * Health + usage of every external service a workspace (or the platform's own
 * .env) is wired to. Each check asks the provider directly, with a short
 * timeout, and never returns a key — only its last 4 characters.
 */

export interface UsageLine {
  label: string;
  used?: number;
  limit?: number;
  /** free-form value when there is no used/limit pair (e.g. a balance) */
  text?: string;
}

export interface IntegrationStatus {
  key: string;
  name: string;
  purpose: string;
  /** whose key is used */
  source: "workspace" | "platform" | "none";
  keyHint?: string;
  status: "ok" | "warning" | "error" | "not_configured" | "unchecked";
  detail: string;
  usage: UsageLine[];
  /** Settings tab to open to fix it */
  settingsTab: string;
}

const TIMEOUT_MS = 7000;
const hint = (v: string) => (v ? `…${v.slice(-4)}` : undefined);

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function failure(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|aborted/i.test(msg) ? "No answer from the provider (timed out)." : msg.slice(0, 200);
}

/** Resolve a value: the workspace's own setting first, then the platform's .env (when allowed). */
type Resolver = (settingKey: string, envName?: string) => { value: string; source: "workspace" | "platform" | "none" };

async function resolverFor(agentId: string | null): Promise<Resolver> {
  if (!agentId) {
    return (_k, envName) => {
      const value = envName ? process.env[envName] || "" : "";
      return { value, source: value ? "platform" : "none" };
    };
  }
  const keys = [
    "llmApiKey", "llmProvider", "llmModel", "apifyToken", "voiceApiKey", "elevenLabsAgentId", "plivoAuthId", "plivoAuthToken",
    "callApiKey", "callProvider", "callerPhone", "waProvider", "waApiKey", "waSessionId", "smsProvider", "smsApiKey",
    "smsAccountSid", "smsFrom", "calendlyApiToken", "sttApiKey", "emailProvider", "emailApiKey", "smtpHost", "smtpPort",
    "smtpUser", "smtpPass",
  ];
  const [m, env] = await Promise.all([getSettingsMap(agentId, keys), platformEnv(agentId)]);
  return (settingKey, envName) => {
    if (m[settingKey]) return { value: m[settingKey], source: "workspace" };
    const value = envName ? env(envName) : "";
    return { value, source: value ? "platform" : "none" };
  };
}

function base(key: string, name: string, purpose: string, settingsTab: string, r: { value: string; source: IntegrationStatus["source"] }): IntegrationStatus {
  return {
    key, name, purpose, settingsTab, source: r.source, keyHint: hint(r.value),
    status: r.value ? "unchecked" : "not_configured",
    detail: r.value ? "" : "Not set up.",
    usage: [],
  };
}

async function checkAi(get: Resolver): Promise<IntegrationStatus> {
  const key = get("llmApiKey", "GROQ_API_KEY");
  const provider = get("llmProvider").value || "Groq (Llama 3)";
  const s = base("ai", "AI brain (LLM)", "Writes emails, WhatsApp messages and replies; analyses calls", "llm", key);
  if (!key.value) return s;
  const isOpenAi = /openai|gpt/i.test(provider) && !key.value.startsWith("gsk_");
  try {
    const r = await getJson(isOpenAi ? "https://api.openai.com/v1/models" : "https://api.groq.com/openai/v1/models", { Authorization: `Bearer ${key.value}` });
    if (r.status === 200) {
      s.status = "ok";
      s.detail = `${isOpenAi ? "OpenAI" : "Groq"} key works${get("llmModel").value ? ` · model ${get("llmModel").value}` : ""}. Spend is billed in the ${isOpenAi ? "OpenAI" : "Groq"} console.`;
    } else {
      s.status = "error";
      s.detail = r.status === 401 ? "The key is invalid or was revoked." : `${isOpenAi ? "OpenAI" : "Groq"} answered ${r.status}.`;
    }
  } catch (err) {
    s.status = "error";
    s.detail = failure(err);
  }
  return s;
}

async function checkApify(get: Resolver): Promise<IntegrationStatus> {
  const key = get("apifyToken");
  const s = base("apify", "Apify", "Scrapes leads from Google Maps, LinkedIn and others", "apify", key);
  if (!key.value) return s;
  try {
    const r = await getJson("https://api.apify.com/v2/users/me/limits", { Authorization: `Bearer ${key.value}` });
    if (r.status !== 200) {
      s.status = "error";
      s.detail = r.status === 401 ? "The Apify token is invalid." : `Apify answered ${r.status}.`;
      return s;
    }
    const used = Number(r.body?.data?.current?.monthlyUsageUsd ?? 0);
    const limit = Number(r.body?.data?.limits?.maxMonthlyUsageUsd ?? 0);
    s.usage.push({ label: "Platform credit this month (USD)", used: Math.round(used * 100) / 100, limit: limit || undefined });
    s.status = limit && used >= limit ? "error" : limit && used >= limit * 0.8 ? "warning" : "ok";
    s.detail = limit && used >= limit ? "Monthly Apify credit is used up — scrapers won't start." : "Token works.";
  } catch (err) {
    s.status = "error";
    s.detail = failure(err);
  }
  return s;
}

async function checkElevenLabs(get: Resolver): Promise<IntegrationStatus> {
  const key = get("voiceApiKey", "ELEVENLABS_API_KEY");
  const agent = get("elevenLabsAgentId", "ELEVENLABS_AGENT_ID");
  const s = base("elevenlabs", "ElevenLabs", "The AI voice that talks on calls", "voice", key);
  if (!key.value) return s;
  const headers = { "xi-api-key": key.value };
  try {
    const [sub, agentRes] = await Promise.all([
      getJson("https://api.elevenlabs.io/v1/user/subscription", headers),
      agent.value ? getJson(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agent.value)}`, headers) : Promise.resolve(null),
    ]);
    const problems: string[] = [];
    if (sub.status === 200) {
      const used = Number(sub.body?.character_count ?? 0);
      const limit = Number(sub.body?.character_limit ?? 0);
      s.usage.push({ label: `Credits (${sub.body?.tier ?? "plan"})`, used, limit: limit || undefined });
      if (sub.body?.next_character_count_reset_unix) {
        s.usage.push({ label: "Credits reset", text: new Date(sub.body.next_character_count_reset_unix * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) });
      }
      if (limit && used >= limit) problems.push("Out of credits — calls will fail.");
      else if (limit && used >= limit * 0.9) problems.push("Almost out of credits.");
    } else if (sub.status === 401 && /permission/i.test(JSON.stringify(sub.body))) {
      problems.push("Key works but can't read credits (give it the user_read permission to see them here).");
    } else if (sub.status === 401) {
      s.status = "error";
      s.detail = "The ElevenLabs key is invalid.";
      return s;
    }
    if (!agent.value) problems.push("No voice agent selected — open Settings → Voice Calls → Check & fix ElevenLabs.");
    else if (agentRes && agentRes.status !== 200) problems.push(`The selected agent (${agent.value.slice(0, 14)}…) isn't in this ElevenLabs account.`);
    const fatal = problems.some((p) => /Out of credits|isn't in this|No voice agent/.test(p));
    s.status = fatal ? "error" : problems.length ? "warning" : "ok";
    s.detail = problems.join(" ") || "Key and voice agent work.";
  } catch (err) {
    s.status = "error";
    s.detail = failure(err);
  }
  return s;
}

async function checkPlivo(get: Resolver): Promise<IntegrationStatus> {
  const id = get("plivoAuthId", "PLIVO_AUTH_ID");
  const tokenSetting = get("plivoAuthToken", "PLIVO_AUTH_TOKEN");
  const token = tokenSetting.value ? tokenSetting : get("callApiKey");
  const s = base("plivo", "Plivo", "Places the phone calls (and SMS, if Plivo is the SMS provider)", "voice", token);
  if (!id.value || !token.value) {
    s.status = "not_configured";
    s.detail = "Auth ID / Auth Token not set.";
    return s;
  }
  try {
    const r = await getJson(`https://api.plivo.com/v1/Account/${encodeURIComponent(id.value)}/`, {
      Authorization: `Basic ${Buffer.from(`${id.value}:${token.value}`).toString("base64")}`,
    });
    if (r.status !== 200) {
      s.status = "error";
      s.detail = r.status === 401 ? "Auth ID / Auth Token are wrong." : `Plivo answered ${r.status}.`;
      return s;
    }
    const credits = Number(r.body?.cash_credits ?? NaN);
    if (Number.isFinite(credits)) s.usage.push({ label: "Account balance", text: `${credits.toFixed(2)} ${r.body?.billing_currency ?? "USD"}` });
    const caller = get("callerPhone", "PLIVO_FROM_NUMBER").value;
    if (caller) s.usage.push({ label: "Calling number", text: `+${caller.replace(/\D/g, "")}` });
    s.status = Number.isFinite(credits) && credits <= 1 ? "warning" : "ok";
    s.detail = s.status === "warning" ? "Balance is almost empty — calls will stop." : "Account works.";
  } catch (err) {
    s.status = "error";
    s.detail = failure(err);
  }
  return s;
}

async function checkEmail(get: Resolver): Promise<IntegrationStatus> {
  const provider = get("emailProvider").value || "SMTP";
  if (provider !== "SMTP") {
    const key = get("emailApiKey");
    const s = base("email", `Email (${provider})`, "Sends outreach and reply emails", "email", key);
    if (key.value) s.detail = "API key saved (send a test email from Settings → Email to confirm).";
    return s;
  }
  const user = get("smtpUser", "SMTP_USER");
  const pass = get("smtpPass", "SMTP_PASS");
  const s = base("email", "Email (SMTP)", "Sends outreach and reply emails", "email", pass);
  if (!user.value || !pass.value) {
    s.status = "not_configured";
    s.detail = "SMTP username / password not set.";
    return s;
  }
  const host = get("smtpHost", "SMTP_HOST").value || "smtp.gmail.com";
  const port = parseInt(get("smtpPort", "SMTP_PORT").value || "587", 10);
  try {
    const transport = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user: user.value, pass: pass.value },
      connectionTimeout: TIMEOUT_MS, greetingTimeout: TIMEOUT_MS, socketTimeout: TIMEOUT_MS,
    });
    await transport.verify();
    s.status = "ok";
    s.detail = `Logged in to ${host} as ${user.value}.`;
  } catch (err) {
    s.status = "error";
    s.detail = `Can't log in to ${host}: ${failure(err)}`;
  }
  return s;
}

async function checkWhatsApp(get: Resolver): Promise<IntegrationStatus> {
  const provider = get("waProvider").value || "WireWeb";
  const key = get("waApiKey");
  const session = get("waSessionId").value;
  const s = base("whatsapp", `WhatsApp (${provider})`, "Sends and receives WhatsApp messages", "whatsapp", key);
  if (!key.value || !session) {
    s.status = "not_configured";
    s.detail = "API key / session not set.";
    return s;
  }
  try {
    if (provider === "Meta Cloud API") {
      const r = await getJson(`https://graph.facebook.com/v19.0/${encodeURIComponent(session)}?fields=display_phone_number,verified_name,quality_rating`, { Authorization: `Bearer ${key.value}` });
      if (r.status !== 200) {
        s.status = "error";
        s.detail = r.body?.error?.message || `Meta answered ${r.status}.`;
        return s;
      }
      s.usage.push({ label: "Number", text: `${r.body?.display_phone_number ?? ""} (${r.body?.verified_name ?? ""})` });
      if (r.body?.quality_rating) s.usage.push({ label: "Quality rating", text: String(r.body.quality_rating) });
      s.status = r.body?.quality_rating === "RED" ? "warning" : "ok";
      s.detail = "Access token works.";
    } else if (provider === "Twilio") {
      const r = await getJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(session)}/Balance.json`, {
        Authorization: `Basic ${Buffer.from(`${session}:${key.value}`).toString("base64")}`,
      });
      if (r.status !== 200) {
        s.status = "error";
        s.detail = r.status === 401 ? "Account SID / Auth Token are wrong." : `Twilio answered ${r.status}.`;
        return s;
      }
      s.usage.push({ label: "Twilio balance", text: `${r.body?.balance} ${r.body?.currency}` });
      s.status = Number(r.body?.balance) <= 1 ? "warning" : "ok";
      s.detail = "Account works.";
    } else {
      s.detail = "WireWeb has no status API — send a test message from Settings → WhatsApp to confirm.";
    }
  } catch (err) {
    s.status = "error";
    s.detail = failure(err);
  }
  return s;
}

async function checkSms(get: Resolver): Promise<IntegrationStatus> {
  const provider = get("smsProvider").value || "Plivo";
  const key = provider === "Plivo" ? (get("smsApiKey").value ? get("smsApiKey") : get("plivoAuthToken", "PLIVO_AUTH_TOKEN")) : get("smsApiKey");
  const s = base("sms", `SMS (${provider})`, "Sends text messages", "sms", key);
  const from = provider === "Plivo" ? get("smsFrom").value || get("callerPhone", "PLIVO_FROM_NUMBER").value : get("smsFrom").value;
  if (!key.value || !from) {
    s.status = "not_configured";
    s.detail = "API key / sender number not set.";
    return s;
  }
  s.usage.push({ label: "Sender", text: from });
  s.detail = provider === "Plivo" ? "Uses the Plivo account — see its balance above." : "Saved (send a test SMS from Settings → SMS to confirm).";
  return s;
}

async function checkCalendly(get: Resolver): Promise<IntegrationStatus> {
  const key = get("calendlyApiToken", "CALENDLY_API_TOKEN");
  const s = base("calendly", "Calendly", "Marks leads as booked when they schedule a meeting", "calendly", key);
  if (!key.value) return s;
  try {
    const r = await getJson("https://api.calendly.com/users/me", { Authorization: `Bearer ${key.value}` });
    s.status = r.status === 200 ? "ok" : "error";
    s.detail = r.status === 200 ? `Connected as ${r.body?.resource?.email ?? r.body?.resource?.name ?? "your account"}.` : r.status === 401 ? "The token is invalid." : `Calendly answered ${r.status}.`;
  } catch (err) {
    s.status = "error";
    s.detail = failure(err);
  }
  return s;
}

async function checkDeepgram(get: Resolver): Promise<IntegrationStatus> {
  const key = get("sttApiKey");
  const s = base("deepgram", "Deepgram", "Speech-to-text (only if you use it)", "voice", key);
  if (!key.value) return s;
  try {
    const r = await getJson("https://api.deepgram.com/v1/projects", { Authorization: `Token ${key.value}` });
    s.status = r.status === 200 ? "ok" : "error";
    s.detail = r.status === 200 ? "Key works." : "The key is invalid.";
  } catch (err) {
    s.status = "error";
    s.detail = failure(err);
  }
  return s;
}

/** All integrations of a workspace, or of the platform's .env when agentId is null. */
export async function checkIntegrations(agentId: string | null): Promise<IntegrationStatus[]> {
  const get = await resolverFor(agentId);
  const checks = [checkAi, checkApify, checkElevenLabs, checkPlivo, checkEmail, checkWhatsApp, checkSms, checkCalendly, checkDeepgram];
  const results = await Promise.all(checks.map((c) => c(get).catch((err): IntegrationStatus => ({
    key: c.name, name: c.name.replace(/^check/, ""), purpose: "", source: "none", status: "error",
    detail: failure(err), usage: [], settingsTab: "",
  }))));

  // What this workspace itself sent this month, next to the provider's own numbers.
  if (agentId) {
    const usage = await Usage.findOne({ agentId, month: currentMonth() }).lean();
    const add = (key: string, label: string, used: number | undefined) => {
      const r = results.find((x) => x.key === key);
      if (r && used) r.usage.push({ label, used });
    };
    add("apify", "Leads imported by this workspace this month", usage?.leadsScraped);
    add("email", "Emails sent this month", usage?.emailsSent);
    add("whatsapp", "WhatsApp messages sent this month", usage?.messagesSent);
    add("sms", "SMS sent this month", usage?.smsSent);
    add("plivo", "AI calls this month", usage?.callsMade);
  }
  return results;
}

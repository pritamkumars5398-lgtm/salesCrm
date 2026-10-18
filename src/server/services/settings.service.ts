import { Setting } from "@/lib/models/Setting";
import { resolveGroqModel, groqModelParams } from "@/lib/llm";

/** Load a set of settings keys for an agent as a plain map. */
export async function getSettingsMap(agentId: string, keys: string[]): Promise<Record<string, string>> {
  const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  return m;
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  provider: string;
}

export async function getLLMConfig(agentId: string): Promise<LLMConfig | null> {
  const m = await getSettingsMap(agentId, ["llmApiKey", "llmModel", "llmProvider"]);
  const apiKey = m.llmApiKey || process.env.GROQ_API_KEY || "";
  if (!apiKey) return null;
  return { 
    apiKey, 
    model: m.llmModel || process.env.GROQ_MODEL || "",
    provider: m.llmProvider || "Groq (Llama 3)"
  };
}

export interface VoiceConfig {
  callProvider: string;
  plivoAuthId: string;
  plivoAuthToken: string;
  /** raw configured caller number; validated by the call service */
  callerPhone: string;
  elevenLabsAgentId: string;
  elevenLabsApiKey: string;
  /** raw values — empty when not configured, so the ElevenLabs agent's own config applies */
  callScript: string;
  callGreeting: string;
  maxDurationMin: number;
  /** calling hours in 24h server time; null when not configured */
  windowStartHour: number | null;
  windowEndHour: number | null;
  recordCalls: boolean;
  hangupOnVoicemail: boolean;
  /** "Hindi" | "Hinglish" | "English", or "" to keep the ElevenLabs agent's language */
  callLanguage: string;
  /** how many automated (sequence/campaign) calls may be live at once */
  maxConcurrentCalls: number;
}

function parseHour(v: string | undefined): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 24 ? n : null;
}

export async function getVoiceConfig(agentId: string): Promise<VoiceConfig> {
  const m = await getSettingsMap(agentId, [
    "callProvider", "plivoAuthId", "plivoAuthToken", "callApiKey", "callerPhone",
    "elevenLabsAgentId", "voiceApiKey", "callScript", "callGreeting", "callMaxDuration",
    "callWindowStart", "callWindowEnd", "callRecording", "callVoicemailDetection", "callLanguage", "callConcurrency",
  ]);
  const concurrency = parseInt(m.callConcurrency || "", 10);
  const provider = m.callProvider || "Plivo";
  const maxDuration = parseInt(m.callMaxDuration || "", 10);
  return {
    callProvider: provider,
    plivoAuthId: m.plivoAuthId || process.env.PLIVO_AUTH_ID || "",
    // callApiKey held the Plivo token before plivoAuthToken existed; only trust it for Plivo.
    plivoAuthToken: m.plivoAuthToken || (provider === "Plivo" ? m.callApiKey : "") || process.env.PLIVO_AUTH_TOKEN || "",
    callerPhone: m.callerPhone || process.env.PLIVO_FROM_NUMBER || "",
    elevenLabsAgentId: (m.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID || "").trim(),
    elevenLabsApiKey: (m.voiceApiKey || process.env.ELEVENLABS_API_KEY || "").trim(),
    callScript: (m.callScript || "").trim(),
    callGreeting: (m.callGreeting || "").trim(),
    maxDurationMin: Number.isFinite(maxDuration) && maxDuration > 0 ? Math.min(maxDuration, 60) : 5,
    windowStartHour: parseHour(m.callWindowStart),
    windowEndHour: parseHour(m.callWindowEnd),
    recordCalls: (m.callRecording || "On") !== "Off",
    hangupOnVoicemail: (m.callVoicemailDetection || "Off") !== "Off",
    callLanguage: ["Hindi", "Hinglish", "English"].includes(m.callLanguage) ? m.callLanguage : "",
    maxConcurrentCalls: Number.isFinite(concurrency) && concurrency > 0 ? Math.min(concurrency, 10) : 1,
  };
}

export interface BusinessContext {
  businessWebsite: string;
  businessPhone: string;
  businessServices: string;
  docLink: string;
  customPrompt: string;
}

export async function getBusinessContext(agentId: string): Promise<BusinessContext> {
  const m = await getSettingsMap(agentId, [
    "businessWebsite", "businessPhone", "businessServices", "docLink", "customPrompt",
  ]);
  return {
    businessWebsite: m.businessWebsite || "",
    businessPhone: m.businessPhone || "",
    businessServices: m.businessServices || "",
    docLink: m.docLink || "",
    customPrompt: m.customPrompt || "",
  };
}

export interface WhatsAppConfig {
  provider: string;
  apiKey: string;
  sessionId: string;
  twilioPhoneNumber?: string;
}

export async function getWhatsAppConfig(agentId: string): Promise<WhatsAppConfig | null> {
  const m = await getSettingsMap(agentId, ["waProvider", "waApiKey", "waSessionId", "twilioPhoneNumber"]);
  if (!m.waApiKey || !m.waSessionId) return null;
  return {
    provider: m.waProvider || "WireWeb",
    apiKey: m.waApiKey,
    sessionId: m.waSessionId,
    twilioPhoneNumber: m.twilioPhoneNumber,
  };
}

/** Canonical base URL for links embedded in outgoing messages. */
export function getAppBaseUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) {
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

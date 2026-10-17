import { Setting } from "@/lib/models/Setting";

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
    model: m.llmModel || process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    provider: m.llmProvider || "Groq (Llama 3)"
  };
}

export interface VoiceConfig {
  callProvider: string;
  plivoAuthId: string;
  plivoAuthToken: string;
  callerPhone: string;
  elevenLabsAgentId: string;
  voiceApiKey: string;
  voiceId: string;
  voiceProvider: string;
  callScript: string;
  callGreeting: string;
}

export async function getVoiceConfig(agentId: string): Promise<VoiceConfig> {
  const keys = [
    "callProvider", "plivoAuthId", "plivoAuthToken", "callApiKey", "callerPhone",
    "elevenLabsAgentId", "voiceApiKey", "voiceId", "voiceProvider",
    "callScript", "callGreeting"
  ];
  const m = await getSettingsMap(agentId, keys);
  return {
    callProvider: m.callProvider || "Plivo",
    plivoAuthId: m.plivoAuthId || process.env.PLIVO_AUTH_ID || "",
    plivoAuthToken: m.plivoAuthToken || m.callApiKey || process.env.PLIVO_AUTH_TOKEN || "",
    callerPhone: m.callerPhone || process.env.PLIVO_FROM_NUMBER || "918065535939",
    elevenLabsAgentId: m.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID || "",
    voiceApiKey: m.voiceApiKey || process.env.ELEVENLABS_API_KEY || "",
    voiceId: m.voiceId || "Jessica",
    voiceProvider: m.voiceProvider || "ElevenLabs",
    callScript: m.callScript || "You are an intelligent sales assistant.",
    callGreeting: m.callGreeting || "Hi, this is calling from the sales team.",
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

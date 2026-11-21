import { checkIntegrations, type IntegrationStatus } from "./integration-status.service";
import { getSettingsMap, getVoiceConfig } from "./settings.service";
import { platformEnv } from "./platform-credentials";
import { SMS_COMING_SOON } from "@/lib/constants/coming-soon";

/**
 * What a customer sees about each channel: set up or not, on or off, working or not.
 * Never a provider name, model, account, host or key — the platform admin sets
 * those up per workspace and they stay on the server.
 */
export type ChannelState = "active" | "off" | "not_set_up" | "needs_attention" | "coming_soon";

export interface ChannelStatus {
  key: "ai" | "calls" | "voice" | "whatsapp" | "email" | "sms" | "calendly" | "leadSources";
  title: string;
  purpose: string;
  state: ChannelState;
  message: string;
  /** customer-safe extras: the number calls come from, the sender address, the booking link */
  details: { label: string; value: string }[];
  /** which keyless test the customer can run */
  test?: "call" | "voice" | "email" | "sms" | "whatsapp" | "link";
}

const CACHE_MS = 60_000;
declare global {
  var _channelStatusCache: Map<string, { at: number; data: ChannelStatus[] }> | undefined;
}
const cache = global._channelStatusCache ?? new Map<string, { at: number; data: ChannelStatus[] }>();
global._channelStatusCache = cache;

export function clearChannelStatusCache(agentId?: string) {
  if (agentId) cache.delete(agentId);
  else cache.clear();
}

function fromHealth(h: IntegrationStatus | undefined): "ok" | "bad" | "missing" {
  if (!h || h.status === "not_configured") return "missing";
  return h.status === "error" ? "bad" : "ok";
}

const MESSAGES: Record<ChannelState, string> = {
  active: "Configured · Active",
  off: "Configured · Turned off by your admin",
  not_set_up: "Not set up yet — your admin will set this up",
  needs_attention: "Set up, but not working right now — your admin has been asked to check it",
  coming_soon: "Coming soon — this channel isn't available yet.",
};

function status(
  base: Omit<ChannelStatus, "state" | "message">,
  health: "ok" | "bad" | "missing",
  enabled = true,
): ChannelStatus {
  const state: ChannelState = health === "missing" ? "not_set_up" : !enabled ? "off" : health === "bad" ? "needs_attention" : "active";
  return { ...base, state, message: MESSAGES[state] };
}

export async function getChannelStatus(agentId: string, opts: { fresh?: boolean } = {}): Promise<ChannelStatus[]> {
  const hit = cache.get(agentId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const [health, m, voice, env] = await Promise.all([
    checkIntegrations(agentId),
    getSettingsMap(agentId, [
      "whatsappEnabled", "voiceEnabled", "emailEnabled", "smsEnabled", "calendlyEnabled", "calendlyLink",
      "smtpFrom", "smsFrom", "apifyScraperEnabled", "llmScraperEnabled",
      "openaiEnabled", "anthropicEnabled", "geminiEnabled", "openaiApiKey", "anthropicApiKey", "geminiApiKey",
    ]),
    getVoiceConfig(agentId),
    platformEnv(agentId),
  ]);
  const h = (key: string) => health.find((x) => x.key === key);
  const on = (key: string) => m[key] !== "false";

  // Phone calls (the line) and the AI voice (how the agent sounds) are set up separately.
  const line = fromHealth(h("plivo"));
  const engine = voice.voiceProvider === "ElevenLabs"
    ? fromHealth(h("elevenlabs"))
    : voice.geminiApiKey ? "ok" : "missing";
  const callsDetails = voice.callerPhone ? [{ label: "Calls come from", value: `+${voice.callerPhone.replace(/\D/g, "")}` }] : [];

  // Lead sources: scrapers or AI search, whichever the admin set up.
  const apify = fromHealth(h("apify"));
  const aiSearchKeys = (["openai", "anthropic", "gemini"] as const).some((p) => m[`${p}Enabled`] === "true" && m[`${p}ApiKey`]);
  const sourcesHealth = apify === "ok" || aiSearchKeys ? "ok" : apify === "bad" ? "bad" : "missing";
  const sourcesOn = on("apifyScraperEnabled") || m.llmScraperEnabled === "true";

  const email = h("email");
  const emailFrom = m.smtpFrom || (email?.source === "platform" ? env("SMTP_USER") : "");
  const sms = h("sms");
  const smsFrom = sms?.usage.find((u) => u.label === "Sender")?.text || m.smsFrom || "";

  const data: ChannelStatus[] = [
    status({ key: "ai", title: "AI brain", purpose: "Writes your emails and messages, replies to leads and understands calls.", details: [] }, fromHealth(h("ai"))),
    status({ key: "calls", title: "Phone calls", purpose: "The phone line your AI agent uses to call leads and take calls.", details: callsDetails, test: engine === "missing" ? undefined : "call" }, line, on("voiceEnabled")),
    status({ key: "voice", title: "AI voice", purpose: "How your AI agent sounds on calls. Listen to the voices, pick one, and choose the call language.", details: [], test: "voice" }, engine),
    status({ key: "whatsapp", title: "WhatsApp", purpose: "Sends and receives WhatsApp messages with your leads.", details: [], test: "whatsapp" }, fromHealth(h("whatsapp")), on("whatsappEnabled")),
    status({ key: "email", title: "Email", purpose: "Sends outreach and reply emails.", details: emailFrom ? [{ label: "Sends from", value: emailFrom }] : [], test: "email" }, fromHealth(email), on("emailEnabled")),
    SMS_COMING_SOON
      ? { key: "sms", title: "SMS", purpose: "Text messages to your leads — coming soon.", details: [], state: "coming_soon", message: MESSAGES.coming_soon }
      : status({ key: "sms", title: "SMS", purpose: "Sends text messages to your leads.", details: smsFrom ? [{ label: "Sends from", value: smsFrom }] : [], test: "sms" }, fromHealth(sms), on("smsEnabled")),
    status(
      { key: "calendly", title: "Meeting booking", purpose: "Leads book a meeting with you; booked leads are marked automatically.", details: m.calendlyLink ? [{ label: "Booking link", value: m.calendlyLink }] : [], test: m.calendlyLink ? "link" : undefined },
      m.calendlyLink || fromHealth(h("calendly")) !== "missing" ? (fromHealth(h("calendly")) === "bad" ? "bad" : "ok") : "missing",
      m.calendlyEnabled !== "false",
    ),
    status({ key: "leadSources", title: "Lead sources", purpose: "Finds new leads for you when you press Sync sources.", details: [] }, sourcesHealth, sourcesOn),
  ];

  cache.set(agentId, { at: Date.now(), data });
  return data;
}

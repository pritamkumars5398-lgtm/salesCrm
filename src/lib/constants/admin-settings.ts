import { INTEGRATION_CARDS } from "./settings";
import { isSecretSettingKey } from "@/lib/secret-settings";
import { SMS_COMING_SOON } from "./coming-soon";

/**
 * Which settings belong to the platform admin (superadmin) and which to the customer.
 *
 * The customer fills in business data only (profile, playbook, lead fields, groups,
 * knowledge, team, lead-source keywords). Everything that picks a provider, a model
 * or holds a key is set up by the superadmin for each workspace, and the customer
 * only sees whether it is configured and active.
 */

/** Keys from the lead-source pages that are technical (keys, models, actors). */
const SOURCE_ADMIN_KEYS = [
  "apifyToken",
  "gmActorId", "liActorId", "jdActorId", "customActorId", "customActorInput",
  "openaiApiKey", "openaiModel", "anthropicApiKey", "anthropicModel", "geminiApiKey", "geminiModel",
  "llmPrompt", "openaiEnabled", "anthropicEnabled", "geminiEnabled", "llmScraperEnabled",
];

/** Channel on/off switches: turning a channel on only makes sense once the admin has set it up. */
const CHANNEL_TOGGLE_KEYS = INTEGRATION_CARDS.filter((c) => c.togglable).map((c) => `${c.key}Enabled`);

/** Settings only the superadmin may change. */
export const ADMIN_ONLY_KEYS = new Set<string>([
  ...INTEGRATION_CARDS.flatMap((c) => c.fields.map((f) => f.key)),
  ...SOURCE_ADMIN_KEYS,
  ...CHANNEL_TOGGLE_KEYS,
  "llmEnabled", "calendlyEnabled",
  "calProvider", "calApiKey",
  "allowedVoices",
]);

/**
 * Settings never sent to a customer's browser: they would reveal which provider,
 * model or account runs behind the scenes. (Secrets are always blanked on top of this.)
 * `voiceProvider` stays readable: the browser practice call needs it to pick its audio engine.
 */
export const HIDDEN_FROM_CUSTOMER_KEYS = new Set<string>([
  "llmProvider", "llmModel",
  "callProvider", "sttProvider", "plivoAuthId", "elevenLabsAgentId", "geminiVoiceModel",
  "emailProvider", "smtpHost", "smtpPort", "smtpUser", "imapHost", "imapPort", "imapUser",
  "waProvider", "waSessionId", "twilioPhoneNumber",
  "smsProvider", "smsAccountSid",
  "openaiModel", "anthropicModel", "geminiModel",
  "gmActorId", "liActorId", "jdActorId", "customActorId", "customActorInput", "llmPrompt",
  "calProvider",
]);

export function isAdminOnlyKey(key: string): boolean {
  return ADMIN_ONLY_KEYS.has(key) || isSecretSettingKey(key);
}

/** Voice-engine settings (how the agent sounds), as opposed to the phone line. */
export const VOICE_ENGINE_KEYS = new Set([
  "voiceProvider", "geminiApiKey", "geminiVoiceModel", "elevenLabsAgentId", "voiceApiKey", "voiceId", "sttProvider", "sttApiKey",
]);

/** ElevenLabs first, in the order an admin fills them in. */
const VOICE_FIELD_ORDER = ["voiceProvider", "voiceApiKey", "elevenLabsAgentId"];
const VOICE_FIELD_TEXT: Record<string, { label: string; hint: string }> = {
  voiceProvider: { label: "Voice engine", hint: "ElevenLabs for natural voices on phone calls (Gemini also works)." },
  voiceApiKey: { label: "ElevenLabs API key", hint: "Paste a new key to replace the saved one (e.g. when credits run out). Voices below reload after Save." },
  elevenLabsAgentId: { label: "ElevenLabs agent ID", hint: "The Conversational AI agent that talks on calls (starts with agent_)." },
};

/** The integration tabs the superadmin configures per workspace (used by the admin UI). */
export const ADMIN_SETUP_SECTIONS: { key: string; title: string; fields: { label: string; key: string; type?: string; options?: string[]; hint?: string; placeholder?: string }[] }[] = [
  ...INTEGRATION_CARDS.flatMap((c) => {
    const fields = c.fields.filter((f) => f.type !== "webhook-url");
    const toggle = c.togglable ? [{ label: "Turned on for the customer", key: `${c.key}Enabled`, options: ["true", "false"] }] : [];
    if (c.key === "sms" && SMS_COMING_SOON) return [{ key: c.key, title: `${c.title} (coming soon — customers can't use it yet)`, fields: [...toggle, ...fields] }];
    if (c.key !== "voice") return [{ key: c.key, title: c.title, fields: [...toggle, ...fields] }];
    // Voice Calls is two separate setups: the phone line, and the AI voice the agent speaks with.
    return [
      { key: "calls", title: "Phone calls", fields: [...toggle, ...fields.filter((f) => !VOICE_ENGINE_KEYS.has(f.key))] },
      {
        key: "voice",
        title: "AI voice (ElevenLabs)",
        fields: [
          ...VOICE_FIELD_ORDER.map((k) => fields.find((f) => f.key === k)).filter((f): f is NonNullable<typeof f> => !!f).map((f) => ({ ...f, ...VOICE_FIELD_TEXT[f.key] })),
          { label: "Voices this client can use", key: "allowedVoices", type: "voices", hint: "Tick the voices for this client and pick the default with ★. The client can only listen to and choose from these." },
          ...fields.filter((f) => VOICE_ENGINE_KEYS.has(f.key) && !VOICE_FIELD_ORDER.includes(f.key)),
        ],
      },
    ];
  }),
  {
    key: "apify",
    title: "Lead sources — scrapers",
    fields: [
      { label: "Apify API token", key: "apifyToken", type: "password" },
      { label: "Scrapers turned on", key: "apifyScraperEnabled", options: ["true", "false"] },
      { label: "Google Maps actor ID", key: "gmActorId", hint: "Blank = default actor" },
      { label: "LinkedIn actor ID", key: "liActorId", hint: "Blank = default actor" },
      { label: "JustDial actor ID", key: "jdActorId" },
    ],
  },
  {
    key: "llm-scraper",
    title: "Lead sources — AI search",
    fields: [
      { label: "AI search turned on", key: "llmScraperEnabled", options: ["true", "false"] },
      { label: "Search prompt", key: "llmPrompt", type: "textarea" },
      { label: "OpenAI turned on", key: "openaiEnabled", options: ["false", "true"] },
      { label: "OpenAI API key", key: "openaiApiKey", type: "password" },
      { label: "OpenAI model", key: "openaiModel", placeholder: "gpt-4o-mini" },
      { label: "Anthropic turned on", key: "anthropicEnabled", options: ["false", "true"] },
      { label: "Anthropic API key", key: "anthropicApiKey", type: "password" },
      { label: "Anthropic model", key: "anthropicModel" },
      { label: "Gemini turned on", key: "geminiEnabled", options: ["false", "true"] },
      { label: "Gemini API key (also used for Gemini voice)", key: "geminiApiKey", type: "password" },
      { label: "Gemini model", key: "geminiModel" },
    ],
  },
];

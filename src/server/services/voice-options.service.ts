import { GEMINI_VOICES } from "@/lib/constants/gemini-voices";
import { getSettingsMap, getVoiceConfig } from "./settings.service";
import { getAgentVoiceSetup, listAccountVoices } from "./elevenlabs.service";

/**
 * The voices a customer may pick for their AI agent. The platform admin chooses
 * them per workspace (setting `allowedVoices`, JSON [{ id, name }]); the customer
 * can preview each and switch between them — nothing else about the voice engine.
 */
export interface VoiceOption {
  id: string;
  name: string;
  gender?: "female" | "male";
  desc?: string;
  /** a short sample clip, used when the voice can't be spoken live (e.g. a library voice on a free plan) */
  previewUrl?: string;
}

const LIST_CACHE_MS = 10 * 60_000;
declare global {
  var _accountVoiceCache: Map<string, { at: number; voices: Awaited<ReturnType<typeof listAccountVoices>> }> | undefined;
}
type AccountVoices = Awaited<ReturnType<typeof listAccountVoices>>;
const voiceCache = global._accountVoiceCache ?? new Map<string, { at: number; voices: AccountVoices }>();
global._accountVoiceCache = voiceCache;

/** The voices in the workspace's ElevenLabs account (cached), or [] when there's no key. */
export async function getAccountVoices(agentId: string): Promise<AccountVoices> {
  const { elevenLabsApiKey: key } = await getVoiceConfig(agentId);
  if (!key) return [];
  const hit = voiceCache.get(key);
  if (hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.voices;
  try {
    const voices = await listAccountVoices(key);
    voiceCache.set(key, { at: Date.now(), voices });
    return voices;
  } catch (err) {
    console.error("[voice-options] couldn't list voices:", err);
    return hit?.voices ?? [];
  }
}

function genderOf(v: string | undefined): "female" | "male" | undefined {
  return v === "female" || v === "male" ? v : undefined;
}

function isGemini(provider: string | undefined) {
  return !provider || provider === "Google Gemini" || provider === "Gemini";
}

export function parseAllowedVoices(raw: string | undefined): { id: string; name: string }[] {
  try {
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .map((v) => ({ id: String(v?.id ?? "").trim(), name: String(v?.name ?? v?.id ?? "").trim() }))
      .filter((v) => v.id)
      .slice(0, 30);
  } catch {
    return [];
  }
}

/** ElevenLabs voice ids are 20 letters/digits (Gemini voices are names like "Puck"; Deepgram ones "aura-…"). */
export function isElevenLabsVoiceId(id: string | undefined): boolean {
  return /^[A-Za-z0-9]{20}$/.test(id || "");
}

export interface EffectiveVoice {
  /** what actually speaks on calls, practice calls and previews */
  engine: "gemini" | "elevenlabs";
  voiceId: string;
  name: string;
  gender?: "female" | "male";
  desc?: string;
  previewUrl?: string;
}

declare global {
  var _agentVoiceCache: Map<string, { at: number; voiceId: string; name: string; previewUrl?: string }> | undefined;
}
const agentVoiceCache = global._agentVoiceCache ?? new Map<string, { at: number; voiceId: string; name: string; previewUrl?: string }>();
global._agentVoiceCache = agentVoiceCache;

/**
 * The one voice this workspace really speaks with. Gemini workspaces speak the
 * chosen Gemini voice. Every other workspace runs calls through its ElevenLabs
 * agent: the chosen voice when it is an ElevenLabs voice, otherwise (e.g. a
 * leftover Deepgram voice id) the agent's own voice — exactly what a phone call uses.
 */
export async function getEffectiveVoice(agentId: string): Promise<EffectiveVoice> {
  const cfg = await getVoiceConfig(agentId);
  if (isGemini(cfg.voiceProvider)) {
    const id = cfg.voiceId || "Puck";
    const g = GEMINI_VOICES.find((x) => x.id.toLowerCase() === id.toLowerCase());
    return { engine: "gemini", voiceId: g?.id ?? id, name: g?.name ?? id, gender: g?.gender, desc: g?.desc };
  }
  const account = await getAccountVoices(agentId);
  const describe = (id: string, fallbackName: string, previewUrl?: string): EffectiveVoice => {
    const a = account.find((x) => x.voiceId === id);
    const [short, ...rest] = (a?.name || fallbackName || "Current voice").split(/\s+-\s+/);
    return {
      engine: "elevenlabs",
      voiceId: id,
      name: short.trim(),
      gender: genderOf(a?.gender),
      desc: rest.join(" - ") || [a?.accent, a?.description].filter(Boolean).join(", ") || undefined,
      previewUrl: a?.previewUrl ?? previewUrl,
    };
  };
  if (isElevenLabsVoiceId(cfg.voiceId)) return describe(cfg.voiceId, "");

  // Not an ElevenLabs voice: the call falls back to the agent's own voice.
  if (cfg.elevenLabsApiKey && cfg.elevenLabsAgentId) {
    const cacheKey = `${cfg.elevenLabsApiKey.slice(-6)}:${cfg.elevenLabsAgentId}`;
    let hit = agentVoiceCache.get(cacheKey);
    if (!hit || Date.now() - hit.at > LIST_CACHE_MS) {
      try {
        const setup = await getAgentVoiceSetup(cfg.elevenLabsApiKey, cfg.elevenLabsAgentId);
        hit = { at: Date.now(), voiceId: setup.voiceId, name: setup.voiceName, previewUrl: setup.voicePreviewUrl ?? undefined };
        agentVoiceCache.set(cacheKey, hit);
      } catch (err) {
        console.error("[voice-options] couldn't read the agent's voice:", err);
      }
    }
    if (hit?.voiceId) return describe(hit.voiceId, hit.name, hit.previewUrl);
  }
  return { engine: "elevenlabs", voiceId: "", name: "Current voice" };
}

export async function getVoiceOptions(agentId: string): Promise<{ current: VoiceOption; options: VoiceOption[] }> {
  const [m, effective] = await Promise.all([
    getSettingsMap(agentId, ["allowedVoices"]),
    getEffectiveVoice(agentId),
  ]);
  const gemini = effective.engine === "gemini";
  const account = gemini ? [] : await getAccountVoices(agentId);
  const enrich = (v: { id: string; name: string }): VoiceOption => {
    const g = gemini ? GEMINI_VOICES.find((x) => x.id.toLowerCase() === v.id.toLowerCase()) : undefined;
    if (g) return { id: g.id, name: v.name || g.name, gender: g.gender, desc: g.desc };
    const a = account.find((x) => x.voiceId === v.id);
    if (!a) return { id: v.id, name: v.name && v.name !== v.id ? v.name : "Voice" };
    const [short, ...rest] = a.name.split(/\s+-\s+/);
    return {
      id: v.id,
      name: v.name && v.name !== v.id ? v.name : short.trim(),
      gender: genderOf(a.gender),
      desc: rest.join(" - ") || [a.accent, a.description].filter(Boolean).join(", ") || undefined,
      previewUrl: a.previewUrl ?? undefined,
    };
  };
  const picked = parseAllowedVoices(m.allowedVoices)
    // a Gemini workspace can only speak Gemini voices, an ElevenLabs one only ElevenLabs voices
    .filter((v) => (gemini ? !isElevenLabsVoiceId(v.id) : isElevenLabsVoiceId(v.id)));
  // Only the voices the platform admin assigned to this client. None assigned yet =
  // the client keeps the current voice only (it is added below).
  const offered = picked;
  const options = offered.map(enrich);
  const { engine: _engine, ...current } = effective;
  void _engine;
  const inList = options.find((o) => o.id === current.voiceId);
  const currentOption: VoiceOption = inList ?? { id: current.voiceId, name: current.name, gender: current.gender, desc: current.desc, previewUrl: current.previewUrl };
  if (current.voiceId && !inList) options.unshift(currentOption);
  return { current: currentOption, options };
}

/** A customer may use (or preview) a voice only if the admin offered it, or it is the current one. */
export async function isVoiceAllowed(agentId: string, voiceId: string): Promise<boolean> {
  const { options } = await getVoiceOptions(agentId);
  return options.some((o) => o.id === voiceId);
}

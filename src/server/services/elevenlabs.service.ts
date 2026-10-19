/**
 * ElevenLabs Conversational AI setup checks and fixes for phone calls.
 * Used by Settings → Voice Calls → "Check & fix ElevenLabs".
 */

const API = "https://api.elevenlabs.io/v1";
/** Built-in "Jessica" voice — available on every ElevenLabs account. */
const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9";

export type Permission = "convai_read" | "convai_write" | "voices_read";

export interface ElevenLabsCheck {
  /** false when ElevenLabs doesn't recognize the key at all */
  keyValid: boolean;
  keyError?: string;
  /** true = granted, false = missing, null = couldn't tell */
  permissions: Record<Permission, boolean | null>;
  /** agents on this key's account (null if they can't be listed) */
  agents: { id: string; name: string }[] | null;
  agent: null | {
    id: string;
    found: boolean;
    /** couldn't look it up (key lacks convai_read) */
    unknown?: boolean;
    name?: string;
    /** problems that "Fix agent settings" can correct */
    issues: string[];
  };
  /** the call bridge could open a session with this key + agent */
  ready: boolean;
}

type ElevenResult = { status: number; data: any };

async function el(apiKey: string, path: string, init: RequestInit = {}): Promise<ElevenResult> {
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", ...(init.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let data: any = text;
    try { data = text ? JSON.parse(text) : {}; } catch { /* plain text */ }
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { detail: { message: err instanceof Error ? err.message : String(err) } } };
  }
}

function errorInfo(r: ElevenResult): { status?: string; message: string } {
  const d = r.data?.detail ?? r.data;
  return {
    status: typeof d === "object" ? d?.status : undefined,
    message: (typeof d === "object" ? d?.message : String(d || "")) || `HTTP ${r.status}`,
  };
}

/** Interprets an ElevenLabs response as "permission granted / missing / key invalid". */
function permissionFrom(r: ElevenResult): { granted: boolean | null; invalidKey?: string } {
  if (r.status >= 200 && r.status < 300) return { granted: true };
  if (r.status === 404) return { granted: true }; // allowed, resource just doesn't exist
  if (r.status === 401 || r.status === 403) {
    const e = errorInfo(r);
    if (e.status === "missing_permissions" || /missing the permission/i.test(e.message)) return { granted: false };
    return { granted: null, invalidKey: e.message };
  }
  return { granted: null };
}

/**
 * The agent's own first message is just this variable; the CRM fills it in on
 * every call. Some accounts refuse a first_message *override* even when it is
 * switched on, while dynamic variables always work.
 */
export const GREETING_VARIABLE = "{{greeting}}";
const GREETING_PLACEHOLDERS = { greeting: "नमस्ते! मैं प्रिया बोल रही हूँ।", company_name: "your business" };

function agentIssues(agent: any, language: string | null, whatsappToolId?: string | null): string[] {
  const issues: string[] = [];
  const cfg = agent?.conversation_config ?? {};
  const out = cfg.tts?.agent_output_audio_format;
  const inp = cfg.asr?.user_input_audio_format;
  if (out !== "ulaw_8000" || inp !== "ulaw_8000") {
    issues.push("Phone audio isn't μ-law 8000 Hz (works, but costs extra conversion and quality).");
  }
  const ov = agent?.platform_settings?.overrides?.conversation_config_override?.agent ?? {};
  if (!ov.prompt?.prompt) {
    issues.push("The prompt override is off — the CRM's per-lead script is ignored.");
  }
  if (!String(cfg.agent?.first_message ?? "").includes(GREETING_VARIABLE)) {
    issues.push("The agent's first message isn't {{greeting}} — calls open with the agent's fixed greeting instead of the CRM's (press Fix).");
  }
  if (language && !ov.language) issues.push("Language override is off — the CRM's Call Language is ignored.");
  const tools = cfg.agent?.prompt?.built_in_tools ?? {};
  if (!tools.end_call) issues.push("The agent can't hang up by itself (end_call tool is off) — calls stay open until the lead hangs up.");
  if (!tools.voicemail_detection) issues.push("Voicemail detection is off.");
  if (!(cfg.turn?.silence_end_call_timeout > 0)) issues.push("No silence timeout — a silent line is never ended.");
  const toolIds: string[] = cfg.agent?.prompt?.tool_ids ?? [];
  if (!whatsappToolId || !toolIds.includes(whatsappToolId)) {
    issues.push("The agent can't send WhatsApp details during calls (send_whatsapp_details tool not attached) — they'll go out after the call instead.");
  }
  return issues;
}

export const WHATSAPP_TOOL_NAME = "send_whatsapp_details";

const WHATSAPP_TOOL_CONFIG = {
  type: "client",
  name: WHATSAPP_TOOL_NAME,
  description: "Send the lead a WhatsApp message with our company details (website, booking link, contact). Use when the lead asks for details or information on WhatsApp, or after they agree to a meeting or callback. Then tell them it has been sent.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "What the lead needs and any agreed day/time, e.g. 'website and online booking for their clinic, call tomorrow 4 PM'" },
    },
    required: ["topic"],
  },
  expects_response: true,
  response_timeout_secs: 20,
};

/** Find (or create) the account's send_whatsapp_details client tool and return its id. */
async function ensureWhatsAppTool(apiKey: string): Promise<{ id?: string; error?: string }> {
  const list = await el(apiKey, "/convai/tools");
  if (list.status === 200) {
    const found = (list.data.tools ?? []).find((t: any) => t.tool_config?.name === WHATSAPP_TOOL_NAME);
    if (found?.id) return { id: found.id };
  }
  const created = await el(apiKey, "/convai/tools", { method: "POST", body: JSON.stringify({ tool_config: WHATSAPP_TOOL_CONFIG }) });
  if (created.status >= 200 && created.status < 300 && created.data?.id) return { id: created.data.id };
  return { error: errorInfo(created).message };
}

export function elevenLanguageCode(callLanguage: string): string | null {
  return callLanguage === "English" ? "en" : callLanguage ? "hi" : null;
}

export async function checkElevenLabs(apiKey: string, agentId: string, callLanguage: string): Promise<ElevenLabsCheck> {
  const result: ElevenLabsCheck = {
    keyValid: true,
    permissions: { convai_read: null, convai_write: null, voices_read: null },
    agents: null,
    agent: null,
    ready: false,
  };
  if (!apiKey) return { ...result, keyValid: false, keyError: "No ElevenLabs API key entered." };

  const [list, voices] = await Promise.all([
    el(apiKey, "/convai/agents?page_size=50"),
    el(apiKey, "/voices?page_size=1"),
  ]);
  const listPerm = permissionFrom(list);
  const voicePerm = permissionFrom(voices);
  const invalid = listPerm.invalidKey ?? voicePerm.invalidKey;
  if (invalid) return { ...result, keyValid: false, keyError: invalid };
  result.permissions.convai_read = listPerm.granted;
  result.permissions.voices_read = voicePerm.granted;
  if (list.status === 200) {
    result.agents = (list.data.agents ?? []).map((a: any) => ({ id: a.agent_id, name: a.name }));
  }

  if (agentId) {
    const [agentRes, signed, tools] = await Promise.all([
      el(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`),
      el(apiKey, `/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`),
      el(apiKey, "/convai/tools"),
    ]);
    const whatsappToolId = tools.status === 200
      ? (tools.data.tools ?? []).find((t: any) => t.tool_config?.name === WHATSAPP_TOOL_NAME)?.id ?? null
      : null;
    const signedPerm = permissionFrom(signed);
    result.permissions.convai_write = signedPerm.granted;
    if (agentRes.status === 200) {
      result.agent = { id: agentId, found: true, name: agentRes.data.name, issues: agentIssues(agentRes.data, elevenLanguageCode(callLanguage), whatsappToolId) };
    } else {
      result.agent = { id: agentId, found: false, unknown: agentRes.status !== 404, issues: [] };
    }
    result.ready = signed.status === 200;
  }
  return result;
}

function phoneAgentConfig(callLanguage: string) {
  const language = elevenLanguageCode(callLanguage);
  const sys = (name: string, description: string) => ({ type: "system", name, description, params: { system_tool_type: name } });
  return {
    conversation_config: {
      ...(language ? { agent: { language } } : {}),
      tts: { agent_output_audio_format: "ulaw_8000" },
      asr: { user_input_audio_format: "ulaw_8000" },
      turn: { silence_end_call_timeout: 20 },
    },
    builtInTools: {
      end_call: sys("end_call", "End the call once the conversation is finished, the person says goodbye or is not interested, it is a wrong number, or you reached an automated phone menu."),
      voicemail_detection: sys("voicemail_detection", "Detect voicemail / answering machines and end the call without leaving a message."),
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { first_message: true, language: true, prompt: { prompt: true } },
        },
      },
    },
  };
}

/** Apply the phone-call essentials to an existing agent (keeps its prompt and voice). */
export async function fixElevenLabsAgent(apiKey: string, agentId: string, callLanguage: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = phoneAgentConfig(callLanguage);
  const [tool, current] = await Promise.all([
    ensureWhatsAppTool(apiKey),
    el(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`),
  ]);
  const existingIds: string[] = current.data?.conversation_config?.agent?.prompt?.tool_ids ?? [];
  const toolIds = tool.id ? [...new Set([...existingIds, tool.id])] : existingIds;
  const body = {
    conversation_config: {
      ...cfg.conversation_config,
      agent: {
        ...(cfg.conversation_config.agent ?? {}),
        first_message: GREETING_VARIABLE,
        dynamic_variables: { dynamic_variable_placeholders: GREETING_PLACEHOLDERS },
        prompt: { built_in_tools: cfg.builtInTools, tool_ids: toolIds },
      },
    },
    platform_settings: cfg.platform_settings,
  };
  const r = await el(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`, { method: "PATCH", body: JSON.stringify(body) });
  return r.status >= 200 && r.status < 300 ? { ok: true } : { ok: false, error: errorInfo(r).message };
}

/** Create a phone-ready agent on the key's account. The CRM supplies the per-lead script at call time. */
export async function createElevenLabsAgent(
  apiKey: string,
  name: string,
  callLanguage: string,
): Promise<{ ok: boolean; agentId?: string; error?: string }> {
  const cfg = phoneAgentConfig(callLanguage);
  const hindi = cfg.conversation_config.agent?.language === "hi";
  const tool = await ensureWhatsAppTool(apiKey);
  const build = (modelId?: string) => ({
    name,
    conversation_config: {
      ...cfg.conversation_config,
      agent: {
        ...(cfg.conversation_config.agent ?? {}),
        first_message: GREETING_VARIABLE,
        dynamic_variables: {
          dynamic_variable_placeholders: hindi ? GREETING_PLACEHOLDERS : { greeting: "Hello! This is Priya.", company_name: "your business" },
        },
        prompt: {
          prompt: "You are Priya, a friendly business consultant on a phone call. Keep replies short. The CRM sends full instructions for each call.",
          built_in_tools: cfg.builtInTools,
          ...(tool.id ? { tool_ids: [tool.id] } : {}),
        },
      },
      tts: { ...cfg.conversation_config.tts, voice_id: DEFAULT_VOICE_ID, ...(modelId ? { model_id: modelId } : {}) },
    },
    platform_settings: cfg.platform_settings,
  });
  // Hindi needs a multilingual voice model; fall back to the account default if that one isn't offered.
  let r = await el(apiKey, "/convai/agents/create", { method: "POST", body: JSON.stringify(build("eleven_flash_v2_5")) });
  if (r.status >= 400 && r.status !== 401 && r.status !== 403) {
    r = await el(apiKey, "/convai/agents/create", { method: "POST", body: JSON.stringify(build()) });
  }
  if (r.status >= 200 && r.status < 300 && r.data?.agent_id) return { ok: true, agentId: r.data.agent_id };
  return { ok: false, error: errorInfo(r).message };
}

// ── Voice & brain setup (Settings → Voice Calls → Agent voice & brain) ───────

export interface AgentVoiceSetup {
  llm: string;
  temperature: number;
  voiceId: string;
  voiceName: string;
  voicePreviewUrl: string | null;
  ttsModel: string;
  speed: number;
  stability: number;
  similarity: number;
  language: string;
}

export interface VoiceOption {
  voiceId: string;
  name: string;
  gender?: string;
  accent?: string;
  age?: string;
  description?: string;
  previewUrl: string | null;
  /** library voices: who shared it (needed to add it to the account) */
  publicOwnerId?: string;
  /** library voices: usable on ElevenLabs' free plan */
  freeUsersAllowed?: boolean;
  source: "account" | "library";
}

/** Models that handle Hindi/Hinglish phone conversations well and fast. */
export const RECOMMENDED_LLMS = ["gemini-3.5-flash", "gpt-5.4-mini", "claude-haiku-5-5", "gpt-4o-mini"];
/** Multilingual, low-latency voice models usable by conversational agents. */
export const TTS_MODELS = [
  { id: "eleven_flash_v2_5", label: "Flash v2.5 — fastest replies" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5 — a bit richer, still fast" },
];

function elFail(r: ElevenResult, what: string): never {
  const e = errorInfo(r);
  const hint = e.status === "missing_permissions" || /permission/i.test(e.message)
    ? " — give the key that permission in ElevenLabs → Developers → API Keys."
    : "";
  throw new Error(`${what}: ${e.message}${hint}`);
}

export async function getAgentVoiceSetup(apiKey: string, agentId: string): Promise<AgentVoiceSetup> {
  const r = await el(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`);
  if (r.status !== 200) elFail(r, "Couldn't load the agent");
  const cc = r.data?.conversation_config ?? {};
  const voiceId = cc.tts?.voice_id ?? "";
  const voice = voiceId ? await el(apiKey, `/voices/${encodeURIComponent(voiceId)}`) : null;
  return {
    llm: cc.agent?.prompt?.llm ?? "",
    temperature: Number(cc.agent?.prompt?.temperature ?? 0),
    voiceId,
    voiceName: voice?.status === 200 ? voice.data?.name ?? voiceId : voiceId,
    voicePreviewUrl: voice?.status === 200 ? voice.data?.preview_url ?? null : null,
    ttsModel: cc.tts?.model_id ?? "",
    speed: Number(cc.tts?.speed ?? 1),
    stability: Number(cc.tts?.stability ?? 0.5),
    similarity: Number(cc.tts?.similarity_boost ?? 0.8),
    language: cc.agent?.language ?? "",
  };
}

export async function listAgentLlms(apiKey: string): Promise<string[]> {
  const r = await el(apiKey, "/convai/llm/list");
  if (r.status !== 200) return RECOMMENDED_LLMS;
  const all: string[] = (r.data?.llms ?? [])
    .filter((m: { deprecation_info?: { is_deprecated?: boolean } }) => !m.deprecation_info?.is_deprecated)
    .map((m: { llm: string }) => m.llm)
    // Dated snapshots and custom-llm aren't useful choices here.
    .filter((id: string) => id !== "custom-llm" && !/[-@]\d{4}-?\d{2}-?\d{2}$|\d{8}$|-\d{4}$/.test(id));
  return [...RECOMMENDED_LLMS.filter((id) => all.includes(id)), ...all.filter((id) => !RECOMMENDED_LLMS.includes(id))];
}

export async function listAccountVoices(apiKey: string): Promise<VoiceOption[]> {
  const r = await el(apiKey, "/voices");
  if (r.status !== 200) elFail(r, "Couldn't load your voices");
  return (r.data?.voices ?? []).map((v: any) => ({
    voiceId: v.voice_id, name: v.name, gender: v.labels?.gender, accent: v.labels?.accent, age: v.labels?.age,
    description: v.labels?.descriptive ?? v.description ?? "", previewUrl: v.preview_url ?? null, source: "account" as const,
  }));
}

export async function searchLibraryVoices(apiKey: string, q: { language?: string; gender?: string; search?: string; page?: number }): Promise<VoiceOption[]> {
  const params = new URLSearchParams({ page_size: "30", page: String(q.page ?? 0), sort: "usage_character_count_1y" });
  if (q.language) params.set("language", q.language);
  if (q.gender) params.set("gender", q.gender);
  if (q.search) params.set("search", q.search);
  const r = await el(apiKey, `/shared-voices?${params}`);
  if (r.status !== 200) elFail(r, "Couldn't search the voice library");
  return (r.data?.voices ?? []).map((v: any) => ({
    voiceId: v.voice_id, name: v.name, gender: v.gender, accent: v.accent, age: v.age,
    description: v.descriptive || v.description || "", previewUrl: v.preview_url ?? null,
    publicOwnerId: v.public_owner_id, freeUsersAllowed: v.free_users_allowed !== false, source: "library" as const,
  }));
}

/** Text → speech in a given voice, for "hear my greeting". Returns MP3 bytes. */
export async function speakSample(apiKey: string, voiceId: string, text: string, opts: { model?: string; speed?: number; stability?: number; similarity?: number }): Promise<Buffer> {
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: text.slice(0, 400),
      model_id: opts.model || "eleven_flash_v2_5",
      voice_settings: { stability: opts.stability ?? 0.5, similarity_boost: opts.similarity ?? 0.8, speed: opts.speed ?? 1 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    elFail({ status: res.status, data }, "ElevenLabs couldn't speak the sample");
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Save brain + voice on the agent. A library voice is first added to the
 * account (agents can only use the account's own voices).
 */
export async function updateAgentVoiceSetup(
  apiKey: string,
  agentId: string,
  input: {
    llm?: string; temperature?: number; voiceId?: string; voiceName?: string; publicOwnerId?: string;
    ttsModel?: string; speed?: number; stability?: number; similarity?: number;
  },
): Promise<AgentVoiceSetup> {
  let voiceId = input.voiceId;
  if (voiceId && input.publicOwnerId) {
    const mine = await el(apiKey, `/voices/${encodeURIComponent(voiceId)}`);
    if (mine.status !== 200) {
      const add = await el(apiKey, `/voices/add/${encodeURIComponent(input.publicOwnerId)}/${encodeURIComponent(voiceId)}`, {
        method: "POST",
        body: JSON.stringify({ new_name: (input.voiceName || "Library voice").slice(0, 60) }),
      });
      if (add.status < 200 || add.status >= 300) elFail(add, "Couldn't add that library voice to your ElevenLabs account");
      voiceId = add.data?.voice_id || voiceId;
    }
  }
  const clamp = (v: number | undefined, lo: number, hi: number) => (v === undefined || !Number.isFinite(v) ? undefined : Math.min(hi, Math.max(lo, v)));
  const tts: Record<string, unknown> = {};
  if (voiceId) tts.voice_id = voiceId;
  if (input.ttsModel && TTS_MODELS.some((m) => m.id === input.ttsModel)) tts.model_id = input.ttsModel;
  const speed = clamp(input.speed, 0.7, 1.2);
  const stability = clamp(input.stability, 0, 1);
  const similarity = clamp(input.similarity, 0, 1);
  if (speed !== undefined) tts.speed = speed;
  if (stability !== undefined) tts.stability = stability;
  if (similarity !== undefined) tts.similarity_boost = similarity;
  const prompt: Record<string, unknown> = {};
  if (input.llm) prompt.llm = input.llm;
  const temperature = clamp(input.temperature, 0, 1);
  if (temperature !== undefined) prompt.temperature = temperature;

  const body = { conversation_config: { ...(Object.keys(tts).length ? { tts } : {}), ...(Object.keys(prompt).length ? { agent: { prompt } } : {}) } };
  const r = await el(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`, { method: "PATCH", body: JSON.stringify(body) });
  if (r.status < 200 || r.status >= 300) elFail(r, "ElevenLabs didn't accept the change");
  return getAgentVoiceSetup(apiKey, agentId);
}

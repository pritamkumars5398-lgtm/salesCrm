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

function agentIssues(agent: any, language: string | null, whatsappToolId?: string | null): string[] {
  const issues: string[] = [];
  const cfg = agent?.conversation_config ?? {};
  const out = cfg.tts?.agent_output_audio_format;
  const inp = cfg.asr?.user_input_audio_format;
  if (out !== "ulaw_8000" || inp !== "ulaw_8000") {
    issues.push("Phone audio isn't μ-law 8000 Hz (works, but costs extra conversion and quality).");
  }
  const ov = agent?.platform_settings?.overrides?.conversation_config_override?.agent ?? {};
  if (!ov.prompt?.prompt || !ov.first_message) {
    issues.push("Prompt / first-message overrides are off — the CRM's per-lead script and greeting are ignored.");
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
      agent: { ...(cfg.conversation_config.agent ?? {}), prompt: { built_in_tools: cfg.builtInTools, tool_ids: toolIds } },
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
        first_message: hindi ? "नमस्ते! मैं प्रिया बोल रही हूँ। क्या मेरी बात {{company_name}} से हो रही है?" : "Hello! This is Priya. Am I speaking with {{company_name}}?",
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

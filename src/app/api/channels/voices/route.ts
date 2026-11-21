import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { authorizeWorkspace, deny } from "@/server/auth/access";
import { getVoiceOptions, isVoiceAllowed } from "@/server/services/voice-options.service";
import { clearChannelStatusCache } from "@/server/services/channel-status.service";
import { getEffectiveVoice } from "@/server/services/voice-options.service";
import { getPlaybook } from "@/server/services/playbook.service";
import { getVoiceConfig } from "@/server/services/settings.service";
import { enableLanguageSwitching } from "@/server/services/elevenlabs.service";
import { defaultPersona, naturalGreeting } from "@/server/services/call-prompt";

/** Languages the AI agent can speak on calls (it still switches if the lead prefers another). */
const CALL_LANGUAGES = ["English", "Hindi", "Hinglish"] as const;

async function currentLanguage(agentId: string): Promise<string> {
  const row = await Setting.findOne({ agentId, key: "callLanguage" }).lean();
  return CALL_LANGUAGES.includes(row?.value as (typeof CALL_LANGUAGES)[number]) ? row!.value : "English";
}

const SAMPLE_COMPANY = "Sharma Traders";
const MAX_GREETING = 300;
const MAX_OPENINGS = 5;

/** The opening line: the customer's own (if written) and the one we'd suggest for their business. */
async function greetingInfo(agentId: string, language: string) {
  const [playbook, voice, row] = await Promise.all([
    getPlaybook(agentId),
    getEffectiveVoice(agentId).catch(() => null),
    Setting.findOne({ agentId, key: "callGreeting" }).lean(),
  ]);
  const suggested = naturalGreeting({
    language,
    persona: playbook.aiPersonaName || defaultPersona(voice?.gender),
    brand: playbook.brandName,
    gender: voice?.gender,
    hasCompany: true,
    variant: 0,
  });
  return { custom: row?.value || "", suggested, sampleCompany: SAMPLE_COMPANY };
}

/** GET ?agentId — the AI voice in use, the voices this customer can pick, the call language and the opening line. */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const [voices, language] = await Promise.all([getVoiceOptions(access.agentId), currentLanguage(access.agentId)]);
  const greeting = await greetingInfo(access.agentId, language);
  return NextResponse.json({ ...voices, language, languages: CALL_LANGUAGES, greeting });
}

/** POST { agentId, voiceId?, language? } — switch to one of the offered voices and/or the call language. */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({})) as { agentId?: string; voiceId?: string; language?: string; greeting?: string };
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;

  // The first thing the agent says. "" = go back to the suggested, business-based opening.
  if (body.greeting !== undefined) {
    // One opening per line; each call picks one at random so calls don't all sound the same.
    const lines = String(body.greeting).split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (lines.length > MAX_OPENINGS) return deny(400, `Write up to ${MAX_OPENINGS} openings, one per line.`).response;
    if (lines.some((l) => l.length > MAX_GREETING)) return deny(400, `Keep each opening under ${MAX_GREETING} characters — one or two short sentences.`).response;
    const text = lines.join("\n");
    await Setting.updateOne({ agentId: access.agentId, key: "callGreeting" }, { $set: { value: text } }, { upsert: true });
    const greeting = await greetingInfo(access.agentId, await currentLanguage(access.agentId));
    return NextResponse.json({ ok: true, greeting });
  }

  if (body.language !== undefined) {
    if (!CALL_LANGUAGES.includes(body.language as (typeof CALL_LANGUAGES)[number])) return deny(400, "Pick English, Hindi or Hinglish.").response;
    await Setting.updateOne({ agentId: access.agentId, key: "callLanguage" }, { $set: { value: body.language } }, { upsert: true });
    // ElevenLabs agents also need the language-switch tool, so a lead who answers in
    // another language hears the agent switch voice and listening too (best effort).
    const vc = await getVoiceConfig(access.agentId);
    if (vc.voiceProvider !== "Google Gemini" && vc.elevenLabsApiKey && vc.elevenLabsAgentId) {
      const r = await enableLanguageSwitching(vc.elevenLabsApiKey, vc.elevenLabsAgentId, body.language).catch((e) => ({ ok: false, error: String(e) }));
      if (!r.ok) console.error("[channels/voices] couldn't turn on language switching:", r.error);
    }
    if (!body.voiceId) return NextResponse.json({ ok: true, language: body.language });
  }

  const voiceId = String(body.voiceId || "").trim();
  if (!voiceId || !(await isVoiceAllowed(access.agentId, voiceId))) return deny(400, "That voice isn't available — ask your admin to add it.").response;

  await Setting.updateOne({ agentId: access.agentId, key: "voiceId" }, { $set: { value: voiceId } }, { upsert: true });
  clearChannelStatusCache(access.agentId);

  // An ElevenLabs agent keeps its own voice: update it there too (same as the admin settings save).
  const s = Object.fromEntries((await Setting.find({ agentId: access.agentId, key: { $in: ["voiceProvider", "voiceApiKey", "elevenLabsAgentId"] } }).lean()).map((r) => [r.key, r.value]));
  if (s.voiceProvider === "ElevenLabs") {
    const apiKey = s.voiceApiKey || process.env.ELEVENLABS_API_KEY;
    const elevenAgentId = s.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID;
    if (apiKey && elevenAgentId) {
      fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(elevenAgentId)}`, {
        method: "PATCH",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_config: { tts: { voice_id: voiceId } } }),
      }).catch((e) => console.error("[channels/voices] ElevenLabs voice sync error:", e));
    }
  }
  const { current } = await getVoiceOptions(access.agentId);
  return NextResponse.json({ ok: true, current });
}

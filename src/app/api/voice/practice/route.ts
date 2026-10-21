import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { authorizeWorkspace } from "@/server/auth/access";
import { getVoiceConfig } from "@/server/services/settings.service";
import { buildCallInstructions } from "@/server/services/call-prompt";

const SPEECH_LANG: Record<string, string> = { English: "en", Hindi: "hi", Hinglish: "hi" };

/**
 * POST { agentId, leadId? } — start a practice conversation in the browser with
 * the real ElevenLabs agent, briefed exactly as a phone call to this lead would
 * be (greeting, pitch, lead history). Nothing is dialed. Returns a one-time
 * signed URL so the ElevenLabs key never reaches the browser.
 */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;

  const cfg = await getVoiceConfig(access.agentId);
  const isGemini = (cfg.voiceProvider || "Google Gemini") === "Google Gemini";

  let lead = null;
  if (body.leadId) {
    if (!Types.ObjectId.isValid(body.leadId)) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    lead = await Lead.findOne({ _id: body.leadId, agentId: access.agentId });
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const { prompt, firstMessage } = await buildCallInstructions(access.agentId, cfg, lead, lead?.phone || "");

  const VOICE_NAMES: Record<string, string> = {
    "ch9J8IB6HKlEHQaWQFdk": "Priya (Warm Indian Female)",
    "cgSgspJ2msm6clMCkdW9": "Jessica",
    "EXAVITQu4vr4xnSDxMaL": "Sarah",
    "Xb7hH8MSUJpSbSDYk0k2": "Alice",
    "FGY2WhTYpPnrIDTdsKH5": "Laura",
    "pNInz6obpgDQGcFmaJgB": "Adam",
    "IKne3meq5aSn9XLyUdCD": "Charlie",
    "mg9npuuaf8WJphS6E0Rt": "Aisha",
    "H6QPv2pQZDcGqLwDTIJQ": "Kanika",
  };

  if (isGemini) {
    const geminiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: "Google Gemini API key not configured (Settings → Voice Calls).", provider: "Google Gemini" }, { status: 400 });
    }
    return NextResponse.json({
      provider: "Google Gemini",
      greeting: firstMessage,
      prompt,
      voiceId: cfg.voiceId || "Puck",
      voiceName: cfg.voiceId || "Puck",
      preview: { greeting: firstMessage, prompt, leadName: lead?.fullName || "Sample lead" },
    });
  }

  if (!cfg.elevenLabsApiKey || !cfg.elevenLabsAgentId) {
    return NextResponse.json({ error: "ElevenLabs isn't set up for this workspace (Settings → Voice Calls).", provider: "ElevenLabs" }, { status: 400 });
  }

  // Ensure ElevenLabs agent entity on ElevenLabs servers matches the selected voice
  if (cfg.voiceId) {
    await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(cfg.elevenLabsAgentId)}`, {
      method: "PATCH",
      headers: { "xi-api-key": cfg.elevenLabsApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_config: { tts: { voice_id: cfg.voiceId } } }),
    }).catch(() => {});
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(cfg.elevenLabsAgentId)}`,
    { headers: { "xi-api-key": cfg.elevenLabsApiKey }, signal: AbortSignal.timeout(10000) },
  ).catch(() => null);
  const signed = res ? await res.json().catch(() => ({})) : {};
  if (!res?.ok || !signed.signed_url) {
    const reason = signed?.detail?.message || signed?.detail || `HTTP ${res?.status ?? "no answer"}`;
    return NextResponse.json({ error: `ElevenLabs refused to start a session: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`, provider: "ElevenLabs" }, { status: 502 });
  }

  const company = lead?.company || lead?.fullName || "your business";
  const agentOverride: Record<string, unknown> = { prompt: { prompt } };
  const lang = SPEECH_LANG[cfg.callLanguage];
  if (lang) agentOverride.language = lang;

  const ttsOverride: Record<string, unknown> = {};
  if (cfg.voiceId) ttsOverride.voice_id = cfg.voiceId;

  return NextResponse.json({
    provider: "ElevenLabs",
    voiceId: cfg.voiceId,
    voiceName: VOICE_NAMES[cfg.voiceId] || cfg.voiceId || "Selected Voice",
    signedUrl: signed.signed_url,
    // Same payload shape the phone bridge sends, so the practice run behaves like a real call.
    initiation: {
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        greeting: firstMessage,
        company_name: company,
        lead_name: lead?.fullName || company,
        business_type: lead?.jobTitle || "business",
        location: lead?.location || "",
      },
      conversation_config_override: {
        agent: agentOverride,
        ...(Object.keys(ttsOverride).length ? { tts: ttsOverride } : {}),
      },
    },
    preview: { greeting: firstMessage, prompt, leadName: lead?.fullName || "Sample lead" },
  });
}

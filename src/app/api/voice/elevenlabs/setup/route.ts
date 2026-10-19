import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Agent } from "@/lib/models/Agent";
import { Setting } from "@/lib/models/Setting";
import { authorizeWorkspace } from "@/server/auth/access";
import { getVoiceConfig } from "@/server/services/settings.service";
import {
  TTS_MODELS, getAgentVoiceSetup, listAccountVoices, listAgentLlms, searchLibraryVoices, speakSample, updateAgentVoiceSetup,
} from "@/server/services/elevenlabs.service";

/** The workspace's ElevenLabs key + agent, or a 400 explaining what's missing. */
async function context(req: Request, agentId: string | null) {
  const access = await authorizeWorkspace(req, agentId, { minRole: "admin" });
  if (!access.ok) return { error: access.response };
  const cfg = await getVoiceConfig(access.agentId);
  if (!cfg.elevenLabsApiKey || !cfg.elevenLabsAgentId) {
    return { error: NextResponse.json({ error: "Set the ElevenLabs API key and pick an agent first (Check & fix ElevenLabs above)." }, { status: 400 }) };
  }
  return { access, apiKey: cfg.elevenLabsApiKey, elevenAgentId: cfg.elevenLabsAgentId };
}

const fail = (err: unknown) => NextResponse.json({ error: err instanceof Error ? err.message : "ElevenLabs request failed" }, { status: 502 });

/**
 * GET ?agentId                          → current brain/voice, model & voice lists, other workspaces sharing the agent
 * GET ?agentId&library=1&language&gender&search → voice library search
 */
export async function GET(req: Request) {
  await connectDB();
  const url = new URL(req.url);
  const ctx = await context(req, url.searchParams.get("agentId"));
  if ("error" in ctx) return ctx.error;
  try {
    if (url.searchParams.get("library") === "1") {
      const voices = await searchLibraryVoices(ctx.apiKey, {
        language: url.searchParams.get("language") || undefined,
        gender: url.searchParams.get("gender") || undefined,
        search: url.searchParams.get("search") || undefined,
      });
      return NextResponse.json({ voices });
    }
    const [setup, llms, voices] = await Promise.all([
      getAgentVoiceSetup(ctx.apiKey, ctx.elevenAgentId),
      listAgentLlms(ctx.apiKey),
      listAccountVoices(ctx.apiKey).catch(() => []),
    ]);
    // The same ElevenLabs agent can serve several workspaces — a change affects all of them.
    let sharedWith: string[] = [];
    if (ctx.access.organizationId) {
      const siblings = await Agent.find({ organizationId: ctx.access.organizationId, deletedAt: null, _id: { $ne: ctx.access.agentId } }).select("_id name").lean();
      const using = await Setting.find({ agentId: { $in: siblings.map((s) => s._id) }, key: "elevenLabsAgentId", value: ctx.elevenAgentId }).select("agentId").lean();
      sharedWith = siblings.filter((s) => using.some((u) => String(u.agentId) === String(s._id))).map((s) => s.name);
    }
    return NextResponse.json({ setup, llms, ttsModels: TTS_MODELS, voices, sharedWith });
  } catch (err) {
    return fail(err);
  }
}

/** POST { agentId, voiceId, text, ttsModel?, speed?, stability?, similarity? } → MP3 of the text in that voice. */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const ctx = await context(req, body.agentId);
  if ("error" in ctx) return ctx.error;
  if (!body.voiceId || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "voiceId and text are required" }, { status: 400 });
  }
  try {
    const mp3 = await speakSample(ctx.apiKey, String(body.voiceId), body.text, {
      model: body.ttsModel, speed: Number(body.speed), stability: Number(body.stability), similarity: Number(body.similarity),
    });
    return new Response(new Uint8Array(mp3), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    return fail(err);
  }
}

/** PUT { agentId, llm?, temperature?, voiceId?, voiceName?, publicOwnerId?, ttsModel?, speed?, stability?, similarity? } — save on the agent. */
export async function PUT(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const ctx = await context(req, body.agentId);
  if ("error" in ctx) return ctx.error;
  try {
    const setup = await updateAgentVoiceSetup(ctx.apiKey, ctx.elevenAgentId, {
      llm: typeof body.llm === "string" ? body.llm : undefined,
      temperature: body.temperature === undefined ? undefined : Number(body.temperature),
      voiceId: typeof body.voiceId === "string" ? body.voiceId : undefined,
      voiceName: typeof body.voiceName === "string" ? body.voiceName : undefined,
      publicOwnerId: typeof body.publicOwnerId === "string" ? body.publicOwnerId : undefined,
      ttsModel: typeof body.ttsModel === "string" ? body.ttsModel : undefined,
      speed: body.speed === undefined ? undefined : Number(body.speed),
      stability: body.stability === undefined ? undefined : Number(body.stability),
      similarity: body.similarity === undefined ? undefined : Number(body.similarity),
    });
    // Keep the CRM's own voice setting in step (used by the voice preview elsewhere).
    if (setup.voiceId) await Setting.updateOne({ agentId: ctx.access.agentId, key: "voiceId" }, { $set: { value: setup.voiceId } }, { upsert: true });
    return NextResponse.json({ setup });
  } catch (err) {
    return fail(err);
  }
}

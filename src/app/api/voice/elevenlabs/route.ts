import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { getSettingsMap } from "@/server/services/settings.service";
import { platformEnv } from "@/server/services/platform-credentials";
import { authorizeWorkspace } from "@/server/auth/access";
import { isMaskedValue } from "@/lib/secret-settings";
import {
  checkElevenLabs, createElevenLabsAgent, fixElevenLabsAgent,
} from "@/server/services/elevenlabs.service";

/**
 * Settings → Voice Calls → "Check & fix ElevenLabs".
 * POST { agentId, action: "check" | "select" | "fix" | "create", apiKey?, elevenAgentId? }
 * `apiKey` lets the user test a key typed in the form before saving it; any
 * action that changes the setup also saves that key so key + agent always match.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { action = "check" } = body as { action?: string };
  if (!body.agentId || !Types.ObjectId.isValid(body.agentId)) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  await connectDB();
  const access = await authorizeWorkspace(req, body.agentId, { minRole: "admin" });
  if (!access.ok) return access.response;
  const agentId = access.agentId;
  const [saved, env] = await Promise.all([
    getSettingsMap(agentId, ["voiceApiKey", "elevenLabsAgentId", "callLanguage", "agentName"]),
    platformEnv(agentId),
  ]);
  // The form shows the stored key masked; a masked value means "use what's saved".
  const typedKey = typeof body.apiKey === "string" && !isMaskedValue(body.apiKey) ? body.apiKey.trim() : "";
  const apiKey = typedKey || saved.voiceApiKey || env("ELEVENLABS_API_KEY");
  let elevenAgentId = String(body.elevenAgentId || saved.elevenLabsAgentId || env("ELEVENLABS_AGENT_ID")).trim();
  const callLanguage = saved.callLanguage || "";

  const save = async (values: Record<string, string>) => {
    await Promise.all(Object.entries(values).map(([key, value]) =>
      Setting.updateOne({ agentId, key }, { $set: { value } }, { upsert: true })
    ));
  };
  const keyToSave: Record<string, string> = typedKey && typedKey !== saved.voiceApiKey ? { voiceApiKey: typedKey } : {};

  if (action === "select") {
    if (!elevenAgentId) return NextResponse.json({ error: "Pick an agent first." }, { status: 400 });
    await save({ ...keyToSave, elevenLabsAgentId: elevenAgentId });
  } else if (action === "fix") {
    if (!elevenAgentId) return NextResponse.json({ error: "No ElevenLabs agent selected." }, { status: 400 });
    const r = await fixElevenLabsAgent(apiKey, elevenAgentId, callLanguage);
    if (!r.ok) return NextResponse.json({ error: `ElevenLabs: ${r.error}` }, { status: 502 });
    await save({ ...keyToSave, elevenLabsAgentId: elevenAgentId });
  } else if (action === "create") {
    const r = await createElevenLabsAgent(apiKey, `${saved.agentName || "CRM"} — phone agent`, callLanguage);
    if (!r.ok || !r.agentId) return NextResponse.json({ error: `ElevenLabs: ${r.error}` }, { status: 502 });
    elevenAgentId = r.agentId;
    await save({ ...keyToSave, elevenLabsAgentId: elevenAgentId });
  } else if (action !== "check") {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const check = await checkElevenLabs(apiKey, elevenAgentId, callLanguage);
  return NextResponse.json({ ...check, elevenAgentId, usingTypedKey: !!typedKey });
}

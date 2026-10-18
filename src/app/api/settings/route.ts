import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { resolveGroqModel } from "@/lib/llm";
import { authorizeWorkspace } from "@/server/auth/access";
import { canUsePlatformCredentials } from "@/server/services/platform-credentials";
import { isMaskedValue, isSecretSettingKey, maskSecretValue } from "@/lib/secret-settings";
import { DEFAULT_PIPELINE_LABELS } from "@/lib/constants/business-templates";

/** Never writable through this route: billing is set by plans / superadmin only. */
const PROTECTED_KEYS = new Set(["plan", "custom_limits"]);
const MAX_VALUE_LENGTH = 20000;

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const agentId = access.agentId;

  const defaults: Record<string, string> = {
    llmProvider: "Groq (Llama 3)",
    llmModel: resolveGroqModel(process.env.GROQ_MODEL),
    callProvider: "Plivo",
    voiceProvider: "ElevenLabs",
    voiceId: "cgSgspJ2msm6clMCkdW9",
    sttProvider: "Deepgram",
    emailProvider: "SMTP",
    smtpHost: "smtp.gmail.com",
    smtpPort: "465",
    pipelineLabels: JSON.stringify(DEFAULT_PIPELINE_LABELS),
  };
  // Non-secret platform defaults (hosts, sender identity) are shown only to
  // organizations that actually run on the platform's accounts.
  if (await canUsePlatformCredentials(agentId)) {
    Object.assign(defaults, {
      plivoAuthId: process.env.PLIVO_AUTH_ID || "",
      callerPhone: process.env.PLIVO_FROM_NUMBER || "",
      elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID || "",
      smtpHost: process.env.SMTP_HOST || defaults.smtpHost,
      smtpPort: process.env.SMTP_PORT || defaults.smtpPort,
      smtpUser: process.env.SMTP_USER || "",
      smtpFrom: process.env.SMTP_USER || "",
      smtpFromName: process.env.SMTP_FROM_NAME || "",
    });
    // Platform secrets show as "set" (masked) so the UI knows they're configured.
    const platformSecrets: Record<string, string | undefined> = {
      llmApiKey: process.env.GROQ_API_KEY,
      plivoAuthToken: process.env.PLIVO_AUTH_TOKEN,
      callApiKey: process.env.PLIVO_AUTH_TOKEN,
      voiceApiKey: process.env.ELEVENLABS_API_KEY,
      smtpPass: process.env.SMTP_PASS,
      calendlyApiToken: process.env.CALENDLY_API_TOKEN,
      calendlyWebhookSecret: process.env.CALENDLY_WEBHOOK_SECRET,
    };
    for (const [key, value] of Object.entries(platformSecrets)) if (value) defaults[key] = maskSecretValue(value);
  }

  const settings = await Setting.find({ agentId }).lean();
  const map: Record<string, string> = { ...defaults };
  settings.forEach((s) => {
    if (PROTECTED_KEYS.has(s.key)) return;
    if (s.value !== undefined && s.value !== null && s.value !== "") {
      map[s.key] = isSecretSettingKey(s.key) ? maskSecretValue(s.value) : s.value;
    }
  });
  return NextResponse.json(map);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({})) as { agentId?: string; settings?: Record<string, unknown> };
  const access = await authorizeWorkspace(req, body.agentId, { minRole: "admin" });
  if (!access.ok) return access.response;
  const agentId = access.agentId;
  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ error: "settings object required" }, { status: 400 });
  }

  const incoming: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.settings)) {
    if (PROTECTED_KEYS.has(key) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) continue;
    if (isMaskedValue(value)) continue; // the browser sent back the mask: keep the stored secret
    const str = value === null || value === undefined ? "" : String(value);
    if (str.length > MAX_VALUE_LENGTH) {
      return NextResponse.json({ error: `"${key}" is too long.` }, { status: 400 });
    }
    incoming[key] = str;
  }

  if (incoming.pipelineLabels !== undefined) {
    try {
      const parsed = JSON.parse(incoming.pipelineLabels);
      const clean: Record<string, string> = {};
      for (const stage of Object.keys(DEFAULT_PIPELINE_LABELS)) {
        const label = String(parsed?.[stage] ?? "").trim().slice(0, 30);
        clean[stage] = label || DEFAULT_PIPELINE_LABELS[stage as keyof typeof DEFAULT_PIPELINE_LABELS];
      }
      incoming.pipelineLabels = JSON.stringify(clean);
    } catch {
      return NextResponse.json({ error: "Pipeline stage names are invalid." }, { status: 400 });
    }
  }

  // Fetch current settings to detect actual changes
  const currentSettingsArray = await Setting.find({ agentId }).lean();
  const currentSettings: Record<string, string> = {};
  currentSettingsArray.forEach((s) => { currentSettings[s.key] = s.value; });

  // --- Auto-sync business profile to scrapers ONLY if values actually changed ---
  if (incoming.industry !== undefined && incoming.industry !== currentSettings.industry) {
    const kw = incoming.industry;
    incoming.gmKeyword = kw;
    incoming.linkedinKeyword = kw;
    incoming.jdKeyword = kw;
  }

  if (incoming.leadLocations !== undefined && incoming.leadLocations !== currentSettings.leadLocations) {
    let locString = "";
    try {
      const parsed = JSON.parse(incoming.leadLocations);
      if (Array.isArray(parsed)) {
        const activeLocs = parsed.filter((l: { active?: boolean }) => l.active).map((l: { name?: string }) => l.name);
        locString = activeLocs.join(", ");
      }
    } catch (e) {
      console.error("[Settings] invalid leadLocations JSON", e);
    }

    incoming.gmLocation = locString;
    incoming.linkedinLocation = locString;
    incoming.jdLocation = locString;
  }
  // ----------------------------------------------

  const ops = Object.entries(incoming).map(([key, value]) => ({
    updateOne: {
      filter: { agentId, key },
      update: { $set: { value } },
      upsert: true,
    },
  }));
  if (ops.length) await Setting.bulkWrite(ops);
  return NextResponse.json({ success: true });
}

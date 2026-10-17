import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const defaults: Record<string, string> = {
    llmProvider: "Groq (Llama 3)",
    llmApiKey: process.env.GROQ_API_KEY || "",
    llmModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    callProvider: "Plivo",
    plivoAuthId: process.env.PLIVO_AUTH_ID || "",
    plivoAuthToken: process.env.PLIVO_AUTH_TOKEN || "",
    callApiKey: process.env.PLIVO_AUTH_TOKEN || "",
    callerPhone: process.env.PLIVO_FROM_NUMBER || "918065535939",
    voiceProvider: "ElevenLabs",
    voiceApiKey: process.env.ELEVENLABS_API_KEY || "",
    elevenLabsAgentId: process.env.ELEVENLABS_AGENT_ID || "",
    voiceId: "cgSgspJ2msm6clMCkdW9",
    sttProvider: "Deepgram",
    emailProvider: "SMTP",
    smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: process.env.SMTP_PORT || "465",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    smtpFrom: process.env.SMTP_USER || "",
    smtpFromName: process.env.SMTP_FROM_NAME || "Sales Team",
    calendlyApiToken: process.env.CALENDLY_API_TOKEN || "",
    calendlyWebhookSecret: process.env.CALENDLY_WEBHOOK_SECRET || "",
  };

  const settings = await Setting.find({ agentId }).lean();
  const map: Record<string, string> = { ...defaults };
  settings.forEach((s) => { 
    if (s.value !== undefined && s.value !== null && s.value !== "") {
      map[s.key] = s.value; 
    }
  });
  return NextResponse.json(map);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json() as { agentId: string; settings: Record<string, string> };

  // Fetch current settings to detect actual changes
  const currentSettingsArray = await Setting.find({ agentId: body.agentId }).lean();
  const currentSettings: Record<string, string> = {};
  currentSettingsArray.forEach((s) => { currentSettings[s.key] = s.value; });

  // --- Auto-sync business profile to scrapers ONLY if values actually changed ---
  if (body.settings.industry !== undefined && body.settings.industry !== currentSettings.industry) {
    const kw = body.settings.industry;
    body.settings.gmKeyword = kw;
    body.settings.linkedinKeyword = kw;
    body.settings.jdKeyword = kw;
  }

  if (body.settings.leadLocations !== undefined && body.settings.leadLocations !== currentSettings.leadLocations) {
    let locString = "";
    try {
      const parsed = JSON.parse(body.settings.leadLocations);
      if (Array.isArray(parsed)) {
        const activeLocs = parsed.filter((l: any) => l.active).map((l: any) => l.name);
        locString = activeLocs.join(", ");
      }
    } catch (e) {}
    
    body.settings.gmLocation = locString;
    body.settings.linkedinLocation = locString;
    body.settings.jdLocation = locString;
  }
  // ----------------------------------------------

  const ops = Object.entries(body.settings).map(([key, value]) => ({
    updateOne: {
      filter: { agentId: body.agentId, key },
      update: { $set: { value } },
      upsert: true,
    },
  }));
  await Setting.bulkWrite(ops);
  return NextResponse.json({ success: true });
}

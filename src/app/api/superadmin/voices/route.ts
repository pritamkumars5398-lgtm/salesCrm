import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeSuperadmin } from "@/server/auth/access";
import { getAccountVoices } from "@/server/services/voice-options.service";

/** GET ?agentId — every voice in that workspace's ElevenLabs account, for the admin's "voices the customer can pick". */
export async function GET(req: Request) {
  await connectDB();
  const auth = await authorizeSuperadmin(req);
  if (!auth.ok) return auth.response;
  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });
  const voices = await getAccountVoices(agentId);
  return NextResponse.json({
    voices: voices.map((v) => ({
      id: v.voiceId,
      name: v.name,
      gender: v.gender,
      desc: [v.accent, v.description].filter(Boolean).join(", "),
      previewUrl: v.previewUrl,
      category: v.category,
      /** premade voices also speak live on a free plan; others fall back to their sample clip in previews */
      freePlanOk: v.category === "premade",
    })),
  });
}

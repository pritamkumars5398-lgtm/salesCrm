import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

export async function POST(req: Request) {
  try {
    const { agentId, text, voiceId: reqVoiceId } = await req.json();
    if (!agentId || !text) {
      return NextResponse.json({ error: "agentId and text are required" }, { status: 400 });
    }

    await connectDB();
    const rows = await Setting.find({ agentId, key: { $in: ["voiceApiKey", "voiceId", "voiceProvider"] } }).lean();
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    const apiKey = m.voiceApiKey || "";
    const voiceId = reqVoiceId || m.voiceId || "Bella";
    const provider = m.voiceProvider || "ElevenLabs";

    if (!apiKey) {
      return NextResponse.json({ error: "Voice API key not configured — save your settings first." }, { status: 400 });
    }

    if (provider === "ElevenLabs") {
      const PREMADE_VOICES: Record<string, string> = {
        rachel: "21m00Tcm4TlvDq8ikWAM",
        antoni: "ErXwobaYiN019PkySvjV",
        bella: "EXAVITQu4vr4xnSDxMaL",
        elli: "MF3mGyEYCl7XYW7LE5I9",
        josh: "TxGEqn7CgqZOUsJ96t4v",
        arnold: "VR6A4UBqgJJANC18DGxa",
        adam: "pNInz6obpgHs517UZAcT",
        dom: "AZnzlk1XvdvUeBnXmlld",
      };

      let resolvedVoiceId = voiceId;
      const lowerVoice = voiceId.toLowerCase().trim();

      if (PREMADE_VOICES[lowerVoice]) {
        resolvedVoiceId = PREMADE_VOICES[lowerVoice];
      } else {
        // Try resolving name against user's custom voices list from ElevenLabs API
        try {
          const listRes = await fetch("https://api.elevenlabs.io/v1/voices", {
            headers: { "xi-api-key": apiKey },
          });
          if (listRes.ok) {
            const data = await listRes.json();
            const voicesList = data.voices || [];
            const match = voicesList.find(
              (v: any) => v.name.toLowerCase().trim() === lowerVoice
            );
            if (match) {
              resolvedVoiceId = match.voice_id;
            }
          }
        } catch (e) {
          console.error("Failed to query ElevenLabs custom voices", e);
        }
      }

      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(resolvedVoiceId)}`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 404) {
          return NextResponse.json({
            error: `Voice "${voiceId}" not found in ElevenLabs. Please check your Voice Name / ID in settings.`,
          }, { status: 404 });
        }
        return NextResponse.json({ error: `ElevenLabs error: ${errText}` }, { status: 502 });
      }

      const audioBuffer = await res.arrayBuffer();
      return new Response(audioBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    }

    if (provider === "PlayHT") {
      return NextResponse.json({ error: "PlayHT preview not yet supported — switch to ElevenLabs for in-browser preview." }, { status: 400 });
    }

    if (provider === "Deepgram") {
      const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voiceId)}`, {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        return NextResponse.json({ error: `Deepgram error: ${await res.text()}` }, { status: 502 });
      }
      const audioBuffer = await res.arrayBuffer();
      return new Response(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({ error: `Unsupported voice provider: ${provider}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

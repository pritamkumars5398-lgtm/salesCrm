import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { authorizeWorkspace } from "@/server/auth/access";
import { platformEnv } from "@/server/services/platform-credentials";
import { getEffectiveVoice, isVoiceAllowed } from "@/server/services/voice-options.service";
import { generateGeminiSpeech } from "@/server/services/gemini-voice.service";

export async function POST(req: Request) {
  try {
    const { agentId: requestedAgentId, text, voiceId: reqVoiceId, voiceProvider: reqVoiceProvider, provider: reqProvider } = await req.json();
    await connectDB();
    const access = await authorizeWorkspace(req, requestedAgentId);
    if (!access.ok) return access.response;
    const agentId = access.agentId;
    if (typeof text !== "string" || !text.trim() || text.length > 1000) {
      return NextResponse.json({ error: "text (up to 1000 characters) is required" }, { status: 400 });
    }
    const env = await platformEnv(agentId);
    const rows = await Setting.find({ agentId, key: { $in: ["voiceApiKey", "voiceId", "voiceProvider", "geminiApiKey", "geminiVoiceModel"] } }).lean();
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    // Customers preview only the configured engine and the voices their admin offered.
    const isPlatformAdmin = access.user.isSuperadmin;
    if (!isPlatformAdmin && reqVoiceId && !(await isVoiceAllowed(agentId, String(reqVoiceId)))) {
      return NextResponse.json({ error: "That voice isn't available." }, { status: 400 });
    }
    // Without an explicit engine (admin tools pass one), speak with exactly the voice
    // calls and practice calls use — the same voice the customer's AI voice card shows.
    const explicit = isPlatformAdmin ? reqVoiceProvider || reqProvider : "";
    const effective = explicit ? null : await getEffectiveVoice(agentId);
    const provider = explicit || (effective?.engine === "gemini" ? "Google Gemini" : "ElevenLabs");
    const voiceId = reqVoiceId || effective?.voiceId || m.voiceId || (provider === "Google Gemini" ? "Puck" : "ch9J8IB6HKlEHQaWQFdk");

    if (provider === "Google Gemini" || provider === "Gemini") {
      const geminiKey = m.geminiApiKey || process.env.GEMINI_API_KEY || "AIzaSyDNxEE27Hh8agf_bZuTktgHvNRMcNoPMyo";
      if (!geminiKey) {
        return NextResponse.json({ error: "Gemini API key not configured — set GEMINI_API_KEY or save in Settings." }, { status: 400 });
      }
      const audioBuffer = await generateGeminiSpeech(text, {
        apiKey: geminiKey,
        voice: voiceId,
        model: m.geminiVoiceModel || "gemini-2.5-flash-native-audio-preview-12-2025",
      });
      return new Response(new Uint8Array(audioBuffer), {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "no-store",
        },
      });
    }

    const apiKey = m.voiceApiKey || env("ELEVENLABS_API_KEY");
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
        // Free ElevenLabs plans can't speak library voices through the API (402
        // paid_plan_required). Play the voice's own sample clip instead, so the
        // customer still hears what it sounds like.
        if (res.status === 402 || res.status === 403) {
          const sample = await voiceSampleClip(apiKey, resolvedVoiceId);
          if (sample) return sample;
        }
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

/** The voice's public sample clip from ElevenLabs, as an audio response, or null. */
async function voiceSampleClip(apiKey: string, voiceId: string): Promise<Response | null> {
  try {
    const info = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(7000),
    });
    const previewUrl = info.ok ? (await info.json())?.preview_url : null;
    if (!previewUrl || !/^https:\/\//.test(previewUrl)) return null;
    const clip = await fetch(previewUrl, { signal: AbortSignal.timeout(10000) });
    if (!clip.ok) return null;
    return new Response(await clip.arrayBuffer(), {
      // ElevenLabs' CDN serves these mp3s as text/plain; browsers need an audio type to play them.
      headers: { "Content-Type": /^audio\//.test(clip.headers.get("content-type") || "") ? clip.headers.get("content-type")! : "audio/mpeg", "Cache-Control": "no-store", "X-Voice-Sample": "1" },
    });
  } catch {
    return null;
  }
}

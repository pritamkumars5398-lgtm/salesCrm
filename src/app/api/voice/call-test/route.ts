import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

function getPublicAppUrl(req?: Request): string {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NGROK_URL) return process.env.NGROK_URL.replace(/\/$/, "");
  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      return `${proto}://${host}`;
    }
  }
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (appUrl && !appUrl.includes("localhost") && !appUrl.includes("127.0.0.1")) {
    return appUrl;
  }
  return "https://pleadingly-nonfortifiable-tyron.ngrok-free.dev";
}

export async function POST(req: Request) {
  try {
    const { agentId, testNumber } = await req.json();
    if (!agentId || !testNumber) {
      return NextResponse.json({ error: "agentId and testNumber are required" }, { status: 400 });
    }

    await connectDB();
    
    // Fetch all voice/call settings for the agent
    const keys = [
      "callProvider", "callApiKey", "callerPhone", "plivoAuthId", "plivoAuthToken",
      "voiceProvider", "voiceApiKey", "voiceId", "elevenLabsAgentId",
      "callGreeting", "callScript", "callMaxDuration"
    ];
    const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    const callProvider = m.callProvider || "Plivo";
    const callApiKey   = m.callApiKey || "";
    const callerPhone  = m.callerPhone || "";
    const voiceProvider = m.voiceProvider || "ElevenLabs";
    const voiceId       = m.voiceId || "Jessica";
    const callGreeting  = m.callGreeting || "Hi, this is a test call.";
    const callScript    = m.callScript || "Be a helpful assistant.";
    const maxDuration   = parseInt(m.callMaxDuration || "2", 10) || 2;

    const isPlivoProvider = callProvider === "Plivo" || callProvider.includes("ElevenLabs") || (!callApiKey && process.env.PLIVO_AUTH_ID);

    if (isPlivoProvider) {
      const plivoAuthId = m.plivoAuthId || process.env.PLIVO_AUTH_ID;
      const plivoAuthToken = m.plivoAuthToken || process.env.PLIVO_AUTH_TOKEN;
      const plivoFrom = (callerPhone && (callerPhone.startsWith("9180") || callerPhone.startsWith("+9180") || callerPhone === "918065535939"))
        ? callerPhone
        : (process.env.PLIVO_FROM_NUMBER || "918065535939");

      const { makePlivoCall } = await import("@/lib/plivo-service");
      const appUrl = getPublicAppUrl(req);
      const answerUrl = `${appUrl}/api/calls/plivo-xml?agentId=${agentId}&test=true`;

      console.log(`[CallTest] Dispatching Plivo test call to ${testNumber} (from ${plivoFrom}) via answerUrl: ${answerUrl}`);

      const result = await makePlivoCall({
        to: testNumber,
        answerUrl,
        from: plivoFrom,
        authId: plivoAuthId,
        authToken: plivoAuthToken,
      });

      if (!result.success) {
        console.error("[CallTest] Plivo API error:", result);
        return NextResponse.json({ error: result.message, details: result.error }, { status: 502 });
      }

      return NextResponse.json({ success: true, call: result, provider: "Plivo" });
    }

    if (!callApiKey) {
      return NextResponse.json({ error: "Call API key (Vapi) is not configured in settings." }, { status: 400 });
    }

    if (!callerPhone) {
      return NextResponse.json({ error: "Caller Phone Number (Vapi Phone ID) is missing." }, { status: 400 });
    }

    if (callProvider === "Vapi.ai") {
      // Prepare voice config provider mapping
      let vapiVoiceProvider = "elevenlabs";
      if (voiceProvider.toLowerCase().includes("playht")) vapiVoiceProvider = "playht";
      if (voiceProvider.toLowerCase().includes("deepgram")) vapiVoiceProvider = "deepgram";

      // ElevenLabs pre-made voice IDs lookup mapping
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
      const resolvedVoiceId = PREMADE_VOICES[voiceId.toLowerCase().trim()] || voiceId;

      const payload = {
        phoneNumberId: callerPhone.trim(),
        customer: {
          number: testNumber.trim(),
        },
        assistant: {
          firstMessage: callGreeting,
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: callScript,
              },
            ],
          },
          voice: {
            provider: vapiVoiceProvider,
            voiceId: resolvedVoiceId,
          },
          maxDurationSeconds: Math.min(maxDuration, 2) * 60, // Limit test calls to max 2 mins
        },
      };

      const response = await fetch("https://api.vapi.ai/call/phone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${callApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ error: `Vapi API returned error: ${errorText}` }, { status: 502 });
      }

      const result = await response.json();
      return NextResponse.json({ success: true, call: result });
    }

    return NextResponse.json({ error: `Real calls for provider "${callProvider}" are not yet supported.` }, { status: 400 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to trigger test call" }, { status: 500 });
  }
}

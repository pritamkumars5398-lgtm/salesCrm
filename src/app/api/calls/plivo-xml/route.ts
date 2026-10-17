import { connectDB } from "@/lib/db";
import { buildPlivoHangupXml, buildPlivoSpeakXml, buildPlivoStreamXml } from "@/lib/plivo-service";
import { getVoiceConfig } from "@/server/services/settings.service";
import {
  getPublicAppUrl, isBridgeRunning, markCallAnswered, recordCallError, verifyCallToken,
} from "@/server/services/call.service";

/**
 * Plivo answer_url: called once the callee picks up. Returns the XML that
 * connects the call to the ElevenLabs bridge, or a short apology + hangup when
 * the AI side can't be reached (never leave the callee in silence).
 */
export async function GET(req: Request) {
  return handleAnswer(req);
}

export async function POST(req: Request) {
  return handleAnswer(req);
}

const FALLBACK_MESSAGE = "Sorry, we are unable to connect this call right now. We will call you back shortly. Thank you.";
const FALLBACK_MESSAGE_HI = "माफ़ कीजिए, अभी कॉल कनेक्ट नहीं हो पा रही है। हम आपको जल्द ही दोबारा कॉल करेंगे। धन्यवाद।";

function xml(body: string) {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

async function handleAnswer(req: Request) {
  const url = new URL(req.url);
  const params: Record<string, string> = Object.fromEntries(url.searchParams);
  if (req.method === "POST") {
    try {
      (await req.formData()).forEach((v, k) => { if (typeof v === "string") params[k] = v; });
    } catch { /* Plivo sends GET by default; body is optional */ }
  }

  try {
    await connectDB();
    const call = await verifyCallToken(params.callId ?? null, params.token ?? null);
    if (!call) return xml(buildPlivoHangupXml());

    if (!(await markCallAnswered(call, params.CallUUID))) return xml(buildPlivoHangupXml());

    const cfg = await getVoiceConfig(String(call.agentId));
    const baseUrl = getPublicAppUrl(req);
    const problem =
      !cfg.elevenLabsAgentId || !cfg.elevenLabsApiKey ? "ElevenLabs Agent ID / API key not configured."
      : !isBridgeRunning() ? "Telephony bridge is not running (start the app with server.js)."
      : !baseUrl ? "No public URL to reach the media bridge (set PUBLIC_APP_URL)."
      : null;
    if (problem) {
      await recordCallError(call, problem);
      return cfg.callLanguage && cfg.callLanguage !== "English"
        ? xml(buildPlivoSpeakXml(FALLBACK_MESSAGE_HI, "hi-IN"))
        : xml(buildPlivoSpeakXml(FALLBACK_MESSAGE));
    }

    const q = `callId=${call._id}&token=${params.token}`;
    const wsBase = baseUrl!.replace(/^http/, "ws");
    const maxDurationSec = (call.isTest ? Math.min(cfg.maxDurationMin, 2) : cfg.maxDurationMin) * 60;

    return xml(buildPlivoStreamXml({
      streamUrl: `${wsBase}/ws/plivo?${q}`,
      maxDurationSec,
      recordCallbackUrl: cfg.recordCalls ? `${baseUrl}/api/calls/plivo-status?${q}&event=record` : undefined,
    }));
  } catch (err) {
    console.error("[PlivoXml] answer handling failed:", err);
    return xml(buildPlivoSpeakXml(FALLBACK_MESSAGE));
  }
}

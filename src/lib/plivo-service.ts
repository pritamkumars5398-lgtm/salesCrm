/**
 * Plivo Voice Telephony Service
 * Author: Company Manager & AI Operations Lead
 * Company: DIFMO PRIVATE LIMITED
 */

export interface PlivoCallParams {
  to: string;
  answerUrl: string;
  from: string;
  authId: string;
  authToken: string;
  hangupUrl?: string;
  ringUrl?: string;
  /** hard cap on the call length, in seconds */
  timeLimitSec?: number;
  /** how long to ring before giving up, in seconds */
  ringTimeoutSec?: number;
  /** hang up automatically when an answering machine picks up */
  hangupOnMachine?: boolean;
}

export interface PlivoCallResult {
  success: boolean;
  message: string;
  requestUuid?: string;
  apiId?: string;
  error?: string;
}

const PLIVO_TIMEOUT_MS = 10000;

/**
 * Standardizes phone numbers to E.164 digits without '+' (e.g. 91XXXXXXXXXX).
 * Bare 10-digit and 0-prefixed 11-digit numbers are treated as Indian.
 */
export function formatPhoneNumber(phone: string): string {
  const trimmed = (phone || "").trim();
  let clean = trimmed.replace(/[^0-9]/g, "");
  // International "00" prefix is equivalent to "+"
  if (!trimmed.startsWith("+") && clean.startsWith("00")) clean = clean.slice(2);
  if (clean.length === 10) return `91${clean}`;
  if (clean.length === 11 && clean.startsWith("0")) return `91${clean.slice(1)}`;
  return clean;
}

/** Returns normalized digits, or null when the number can't be a dialable E.164 number. */
export function normalizeDialableNumber(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = formatPhoneNumber(phone);
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return digits;
}

function plivoHeaders(authId: string, authToken: string) {
  return {
    Authorization: `Basic ${Buffer.from(`${authId}:${authToken}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

async function readPlivoBody(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text.slice(0, 300) };
  }
}

/**
 * Initiates an outbound voice call via Plivo API
 */
export async function makePlivoCall(params: PlivoCallParams): Promise<PlivoCallResult> {
  if (!params.authId || !params.authToken) {
    throw new Error("Missing Plivo Auth ID or Auth Token. Please configure them in Settings -> Voice Calls or .env.");
  }

  const payload: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    answer_url: params.answerUrl,
    answer_method: "GET",
  };
  if (params.hangupUrl) {
    payload.hangup_url = params.hangupUrl;
    payload.hangup_method = "POST";
  }
  if (params.ringUrl) {
    payload.ring_url = params.ringUrl;
    payload.ring_method = "POST";
  }
  if (params.timeLimitSec) payload.time_limit = params.timeLimitSec;
  if (params.ringTimeoutSec) payload.ring_timeout = params.ringTimeoutSec;
  if (params.hangupOnMachine) payload.machine_detection = "hangup";

  let response: Response;
  try {
    response = await fetch(`https://api.plivo.com/v1/Account/${params.authId}/Call/`, {
      method: "POST",
      headers: plivoHeaders(params.authId, params.authToken),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PLIVO_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Could not reach Plivo: ${msg}`, error: msg };
  }

  const data = await readPlivoBody(response);

  if (!response.ok) {
    const message =
      response.status === 401 ? "Plivo rejected the credentials (check Auth ID / Auth Token)"
      : data.error || data.message || `Plivo returned HTTP ${response.status}`;
    return { success: false, message: String(message), error: JSON.stringify(data) };
  }

  return {
    success: true,
    message: data.message || "Call queued",
    requestUuid: Array.isArray(data.request_uuid) ? data.request_uuid[0] : data.request_uuid,
    apiId: data.api_id,
  };
}

/** Hangs up a live call (or cancels a ringing one). Treats "already ended" as success. */
export async function hangupPlivoCall(authId: string, authToken: string, callUuid: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Call/${callUuid}/`, {
      method: "DELETE",
      headers: plivoHeaders(authId, authToken),
      signal: AbortSignal.timeout(PLIVO_TIMEOUT_MS),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generates Plivo XML that records the session in the background (optional) and
 * opens a bidirectional mu-law 8kHz audio stream to the WebSocket bridge.
 * The ElevenLabs agent speaks the opening line, so no TTS greeting is played here.
 */
export function buildPlivoStreamXml(opts: {
  streamUrl: string;
  maxDurationSec: number;
  recordCallbackUrl?: string;
}): string {
  const record = opts.recordCallbackUrl
    ? `
    <Record action="${escapeXml(opts.recordCallbackUrl)}" method="POST" callbackUrl="${escapeXml(opts.recordCallbackUrl)}" callbackMethod="POST" recordSession="true" redirect="false" playBeep="false" fileFormat="mp3" maxLength="${opts.maxDurationSec}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${record}
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" streamTimeout="${opts.maxDurationSec}">${escapeXml(opts.streamUrl)}</Stream>
</Response>`;
}

/** Fallback XML when the AI bridge can't be used: speak a short message, then hang up. */
export function buildPlivoSpeakXml(text: string, language: "en-IN" | "hi-IN" = "en-IN"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="Polly.Aditi" language="${language}">${escapeXml(text)}</Speak>
    <Hangup/>
</Response>`;
}

export function buildPlivoHangupXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>`;
}

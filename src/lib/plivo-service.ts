/**
 * Plivo Voice Telephony Service
 * Author: Company Manager & AI Operations Lead
 * Company: DIFMO PRIVATE LIMITED
 */

export interface PlivoCallParams {
  to: string;
  answerUrl: string;
  from?: string;
  hangupUrl?: string;
  ringUrl?: string;
  authId?: string;
  authToken?: string;
}

export interface PlivoCallResult {
  success: boolean;
  message: string;
  requestUuid?: string;
  apiId?: string;
  error?: string;
}

/**
 * Standardizes phone numbers to E.164 format without '+' (e.g. 91XXXXXXXXXX)
 */
export function formatPhoneNumber(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, "");
  // If 10 digits (India standard mobile), prefix with 91
  if (clean.length === 10) {
    return `91${clean}`;
  }
  // If 11 digits starting with 0, replace 0 with 91
  if (clean.length === 11 && clean.startsWith("0")) {
    return `91${clean.slice(1)}`;
  }
  return clean;
}

/**
 * Initiates an outbound voice call via Plivo API
 */
export async function makePlivoCall(params: PlivoCallParams): Promise<PlivoCallResult> {
  const authId = params.authId || process.env.PLIVO_AUTH_ID;
  const authToken = params.authToken || process.env.PLIVO_AUTH_TOKEN;
  const fromNumber = params.from || process.env.PLIVO_FROM_NUMBER || "918065535939";

  if (!authId || !authToken) {
    throw new Error("Missing Plivo Auth ID or Auth Token. Please configure them in Settings -> Voice Calls or .env.");
  }

  const toNumber = formatPhoneNumber(params.to);

  const payload: Record<string, any> = {
    from: fromNumber,
    to: toNumber,
    answer_url: params.answerUrl,
    answer_method: "GET",
  };

  if (params.hangupUrl) {
    payload.hangup_url = params.hangupUrl;
    payload.hangup_method = "POST";
  }

  const endpoint = `https://api.plivo.com/v1/Account/${authId}/Call/`;
  const credentials = Buffer.from(`${authId}:${authToken}`).toString("base64");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      message: data.message || "Failed to initiate Plivo call",
      error: JSON.stringify(data),
    };
  }

  return {
    success: true,
    message: data.message || "Call queued",
    requestUuid: data.request_uuid,
    apiId: data.api_id,
  };
}

/**
 * Generates Plivo XML for bidirectional audio streaming to WebSocket bridge,
 * with optional natural speech greeting via Polly.Aditi TTS before stream opens.
 */
export function buildPlivoStreamXml(websocketStreamUrl: string, greetingText?: string): string {
  if (greetingText && greetingText.trim()) {
    const cleanGreeting = greetingText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="Polly.Aditi" language="en-IN">${cleanGreeting}</Speak>
    <Wait length="1"/>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">
        ${websocketStreamUrl}
    </Stream>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">
        ${websocketStreamUrl}
    </Stream>
</Response>`;
}


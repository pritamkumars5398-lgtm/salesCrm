import { connectDB } from "@/lib/db";
import {
  markCallEnded, markCallRinging, saveCallRecording, verifyCallToken,
} from "@/server/services/call.service";

/**
 * Plivo call lifecycle callbacks (ring_url, hangup_url, Record action/callback).
 * `event` and the per-call token come from the URL we registered; Plivo's own
 * fields (CallStatus, Duration, HangupCauseName, RecordUrl…) arrive as form data.
 */
export async function POST(req: Request) {
  return handleStatus(req);
}

export async function GET(req: Request) {
  return handleStatus(req);
}

const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`;

function ok() {
  return new Response(EMPTY_XML, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } });
}

async function handleStatus(req: Request) {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  if (req.method === "POST") {
    try {
      (await req.formData()).forEach((v, k) => { if (typeof v === "string") params[k] = v; });
    } catch { /* empty or non-form body */ }
  }
  // Our own query params win over anything in the body.
  url.searchParams.forEach((v, k) => { params[k] = v; });

  try {
    await connectDB();
    const call = await verifyCallToken(params.callId ?? null, params.token ?? null);
    if (!call) return new Response("Forbidden", { status: 403 });

    if (params.event === "ring") await markCallRinging(call);
    else if (params.event === "hangup") await markCallEnded(call, params);
    else if (params.event === "record") await saveCallRecording(call, params);
  } catch (err) {
    // Still 200 so Plivo doesn't retry-storm; the stale-call sweep cleans up.
    console.error("[PlivoStatus] callback failed:", err);
  }
  return ok();
}

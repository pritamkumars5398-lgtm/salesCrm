import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Call } from "@/lib/models/Call";
import { authorizeRecord } from "@/server/auth/access";

/**
 * GET ?callId — the call's recording, served from our own domain so the browser
 * can read the sound (live waveform). The provider's media server doesn't allow that
 * cross-site. Only the URL stored on the call is fetched, and only over https.
 * Supports Range requests so seeking works.
 */
export async function GET(req: Request) {
  await connectDB();
  const callId = new URL(req.url).searchParams.get("callId");
  if (!callId || !Types.ObjectId.isValid(callId)) return NextResponse.json({ error: "A valid callId is required." }, { status: 400 });
  const call = await Call.findById(callId).select("agentId recordingUrl").lean();
  const access = await authorizeRecord(req, call, "Recording not found");
  if (!access.ok) return access.response;
  const url = call?.recordingUrl || "";
  if (!/^https:\/\//i.test(url)) return NextResponse.json({ error: "Recording not found" }, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch {
    return NextResponse.json({ error: "Couldn't load the recording." }, { status: 502 });
  }
  if (!upstream.ok) return NextResponse.json({ error: "Couldn't load the recording." }, { status: 502 });
  const body = new Uint8Array(await upstream.arrayBuffer());
  const type = /^audio\//.test(upstream.headers.get("content-type") || "") ? upstream.headers.get("content-type")! : "audio/mpeg";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (range && (range[1] || range[2])) {
    const size = body.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(body.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(body, { headers: { ...headers, "Content-Length": String(body.length) } });
}

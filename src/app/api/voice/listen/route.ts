import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Call } from "@/lib/models/Call";
import { signListenToken } from "@/lib/listen-token";
import { isBridgeRunning } from "@/server/services/call.service";

/** GET ?callId= → { token } for /ws/listen. Only for calls that are still live. */
export async function GET(req: Request) {
  const callId = new URL(req.url).searchParams.get("callId");
  if (!callId || !Types.ObjectId.isValid(callId)) {
    return NextResponse.json({ error: "callId required" }, { status: 400 });
  }
  if (!isBridgeRunning()) {
    return NextResponse.json({ error: "Live listening needs the app running via server.js (npm run dev:ngrok)." }, { status: 503 });
  }
  await connectDB();
  const call = await Call.findById(callId).select("active mode").lean();
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (!call.active || call.mode !== "ai") return NextResponse.json({ error: "This call is no longer live." }, { status: 409 });
  return NextResponse.json({ token: signListenToken(callId) });
}

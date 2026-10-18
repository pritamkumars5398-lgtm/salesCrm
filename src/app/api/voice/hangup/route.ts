import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Call } from "@/lib/models/Call";
import { endCallByUser } from "@/server/services/call.service";
import { authorizeRecord } from "@/server/auth/access";

/** POST ?callId= — hang up (or cancel, if still ringing) a live AI call. */
export async function POST(req: Request) {
  const callId = new URL(req.url).searchParams.get("callId");
  if (!callId || !Types.ObjectId.isValid(callId)) {
    return NextResponse.json({ error: "callId required" }, { status: 400 });
  }
  await connectDB();
  const call = await Call.findById(callId).select("agentId").lean();
  const access = await authorizeRecord(req, call, "Call not found");
  if (!access.ok) return access.response;
  const result = await endCallByUser(callId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

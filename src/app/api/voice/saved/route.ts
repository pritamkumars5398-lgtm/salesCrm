import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Call } from "@/lib/models/Call";
import { authorizeWorkspace } from "@/server/auth/access";
import { getSavedCalls, setCallSaved } from "@/server/services/saved-calls.service";

/** GET ?agentId — ids of the calls this workspace saved (bookmarked). */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const saved = await getSavedCalls(access.agentId);
  return NextResponse.json({ callIds: saved.map((s) => s.callId) });
}

/** POST { agentId, callId, saved } — save or unsave one call. */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({})) as { agentId?: string; callId?: string; saved?: boolean };
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;
  if (!body.callId || !Types.ObjectId.isValid(body.callId)) return NextResponse.json({ error: "A valid callId is required." }, { status: 400 });
  const call = await Call.findOne({ _id: body.callId, agentId: access.agentId }).select("leadId").lean();
  if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  const saved = await setCallSaved(access.agentId, String(call._id), String(call.leadId ?? ""), body.saved !== false);
  return NextResponse.json({ ok: true, callIds: saved.map((s) => s.callId) });
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { onBridgeEnded, verifyCallToken } from "@/server/services/call.service";

/** Internal: the telephony bridge reports that the media stream has closed. */
export async function POST(req: Request) {
  const { callId, token } = await req.json().catch(() => ({}));
  await connectDB();
  const call = await verifyCallToken(callId ?? null, token ?? null);
  if (!call) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await onBridgeEnded(call);
  return NextResponse.json({ ok: true });
}

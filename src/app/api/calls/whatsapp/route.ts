import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { sendCallWhatsAppDetails, verifyCallToken } from "@/server/services/call.service";

/** Internal: the telephony bridge relays the voice agent's send_whatsapp_details tool call. */
export async function POST(req: Request) {
  const { callId, token, topic } = await req.json().catch(() => ({}));
  await connectDB();
  const call = await verifyCallToken(callId ?? null, token ?? null);
  if (!call) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await sendCallWhatsAppDetails(String(call._id), String(topic || ""), "during_call");
  return NextResponse.json(result);
}

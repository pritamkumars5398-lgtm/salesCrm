import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentId  = searchParams.get("agentId")  || "";
  const provider = searchParams.get("provider")  || "";
  const msgId    = searchParams.get("msgId")     || "";

  if (!agentId || !provider || !msgId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  await connectDB();
  const rows = await Setting.find({ agentId, key: { $in: ["smsApiKey", "smsAccountSid"] } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });

  const apiKey     = m.smsApiKey     || "";
  const accountSid = m.smsAccountSid || "";

  // ── Plivo ─────────────────────────────────────────────────────────────────
  if (provider === "Plivo") {
    const res = await fetch(
      `https://api.plivo.com/v1/Account/${accountSid}/Message/${msgId}/`,
      {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${apiKey}`).toString("base64"),
        },
      }
    );
    if (!res.ok) {
      return NextResponse.json({ state: "unknown" });
    }
    const data = await res.json();
    // Plivo states: queued, sent, delivered, undelivered, rejected
    return NextResponse.json({ state: data.message_state as string });
  }

  // ── Twilio ────────────────────────────────────────────────────────────────
  if (provider === "Twilio SMS") {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${msgId}.json`,
      {
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${apiKey}`).toString("base64"),
        },
      }
    );
    if (!res.ok) {
      return NextResponse.json({ state: "unknown" });
    }
    const data = await res.json();
    // Twilio states: queued, sending, sent, delivered, undelivered, failed
    return NextResponse.json({ state: data.status as string });
  }

  // MSG91 has no simple per-message status API without enterprise DLT setup
  return NextResponse.json({ state: "no_status_api" });
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

export async function POST(req: Request) {
  try {
    const { agentId, to } = await req.json();
    if (!agentId || !to) {
      return NextResponse.json({ error: "agentId and to (phone number) are required" }, { status: 400 });
    }

    await connectDB();
    const rows = await Setting.find({
      agentId,
      key: { $in: ["smsProvider", "smsApiKey", "smsAccountSid", "smsFrom"] },
    }).lean();
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    const provider   = m.smsProvider   || "Twilio SMS";
    const apiKey     = m.smsApiKey     || "";
    const accountSid = m.smsAccountSid || "";
    const from       = m.smsFrom       || "";

    if (!apiKey) {
      return NextResponse.json({ error: "Auth Token / API key not configured — save settings first." }, { status: 400 });
    }
    if (!from) {
      return NextResponse.json({ error: "From Number / Sender ID not configured." }, { status: 400 });
    }

    const testMessage = "SalesAgent test: Your SMS integration is working!";

    // ── Twilio ───────────────────────────────────────────────────────────────
    if (provider === "Twilio SMS") {
      if (!accountSid) {
        return NextResponse.json({ error: "Twilio requires an Account SID — add it in the Account SID field." }, { status: 400 });
      }
      const body = new URLSearchParams({ To: to, From: from, Body: testMessage });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${accountSid}:${apiKey}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: `Twilio: ${data.message || "unknown error"} (code ${data.code || res.status})` }, { status: 502 });
      }
      return NextResponse.json({ ok: true, provider: "Twilio SMS", sid: data.sid });
    }

    // ── MSG91 ────────────────────────────────────────────────────────────────
    // Uses the simple sendhttp API (no template required).
    if (provider === "MSG91") {
      let mobile = to.replace(/\D/g, "");
      if (mobile.length === 10) mobile = "91" + mobile;

      const params = new URLSearchParams({
        authkey: apiKey,
        mobiles: mobile,
        message: testMessage,
        sender: from,
        route: "4",       // 4 = transactional
        country: "91",
      });

      const res = await fetch(
        `https://api.msg91.com/api/sendhttp.php?${params.toString()}`,
        { method: "GET" }
      );

      // MSG91 returns plain text like "28-message-id" on success, or "ERROR-XX" on failure
      const text = await res.text();
      console.log("[MSG91 test SMS] response:", text);

      if (!res.ok) {
        return NextResponse.json({ error: `MSG91 HTTP ${res.status}: ${text}` }, { status: 502 });
      }

      // MSG91 200 responses can still be errors ("ERROR-xx", "INVALID_AUTH_KEY", etc.)
      const upper = text.trim().toUpperCase();
      if (upper.startsWith("ERROR") || upper.includes("INVALID") || upper.includes("FAIL")) {
        return NextResponse.json({ error: `MSG91 rejected the request: ${text.trim()}` }, { status: 502 });
      }

      return NextResponse.json({ ok: true, provider: "MSG91", msgId: text.trim() });
    }

    // ── Plivo ────────────────────────────────────────────────────────────────
    if (provider === "Plivo") {
      if (!accountSid) {
        return NextResponse.json({ error: "Plivo requires Auth ID in the Account SID / Auth ID field." }, { status: 400 });
      }

      // Plivo wants numbers without the leading '+' (e.g. 917800730968)
      const dst = to.replace(/^\+/, "");
      const src = from.replace(/^\+/, "");

      const plivoBody = JSON.stringify({ src, dst, text: testMessage });
      console.log("[Plivo test SMS] sending:", plivoBody);

      const res = await fetch(
        `https://api.plivo.com/v1/Account/${accountSid}/Message/`,
        {
          method: "POST",
          headers: {
            Authorization: "Basic " + Buffer.from(`${accountSid}:${apiKey}`).toString("base64"),
            "Content-Type": "application/json",
          },
          body: plivoBody,
        }
      );

      const rawText = await res.text();
      console.log("[Plivo test SMS] status:", res.status, "body:", rawText);

      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* not JSON */ }

      if (!res.ok) {
        const detail = (data.error as string) || (data.message as string) || rawText || `HTTP ${res.status}`;
        return NextResponse.json({ error: `Plivo: ${detail}` }, { status: 502 });
      }

      // Plivo returns 202 with { message_uuid: [...], message: "message(s) queued" }
      const queued = (data.message as string) || "";
      if (queued.toLowerCase().includes("queued") || Array.isArray(data.message_uuid)) {
        return NextResponse.json({ ok: true, provider: "Plivo", uuid: (data.message_uuid as string[])?.[0] });
      }

      // Unexpected body even though 2xx — surface it
      return NextResponse.json({ error: `Plivo responded but couldn't confirm delivery: ${rawText}` }, { status: 502 });
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { Conversation } from "@/lib/models/Conversation";
import { Usage } from "@/lib/models/Usage";
import { checkUsageLimit } from "@/lib/usage-check";
import { currentMonth } from "@/lib/utils/date";

export async function POST(req: Request) {
  try {
    const { agentId, to, text } = await req.json();
    if (!agentId || !to || !text) {
      return NextResponse.json({ error: "agentId, to, and text are required" }, { status: 400 });
    }
    await connectDB();
    
    // Check limit
    const canSend = await checkUsageLimit(agentId, "smsSent", 1);
    if (!canSend) {
      return NextResponse.json({ error: "Plan limit exceeded for SMS." }, { status: 403 });
    }

    const rows = await Setting.find({
      agentId,
      key: { $in: ["smsProvider", "smsApiKey", "smsAccountSid", "smsFrom"] },
    }).lean();

    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    const provider = m.smsProvider || "Twilio SMS";
    const apiKey = m.smsApiKey || "";
    const accountSid = m.smsAccountSid || "";
    const from = m.smsFrom || "";

    if (!apiKey) {
      return NextResponse.json({ error: "SMS API Key not configured for this agent." }, { status: 400 });
    }
    if (!from) {
      return NextResponse.json({ error: "SMS From Number not configured for this agent." }, { status: 400 });
    }

    // ── Twilio ───────────────────────────────────────────────────────────────
    if (provider === "Twilio SMS") {
      if (!accountSid) {
        return NextResponse.json({ error: "Twilio requires an Account SID." }, { status: 400 });
      }
      const body = new URLSearchParams({ To: to, From: from, Body: text });
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
        return NextResponse.json({ error: `Twilio: ${data.message || "unknown error"}` }, { status: 502 });
      }
      await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { smsSent: 1 } }, { upsert: true });
      return NextResponse.json({ ok: true, provider: "Twilio SMS", sid: data.sid });
    }

    // ── MSG91 ────────────────────────────────────────────────────────────────
    if (provider === "MSG91") {
      const hasPlus = to.trim().startsWith("+");
      let mobile = to.replace(/\D/g, "");
      // If exactly 10 digits and no plus sign, assume Indian
      if (!hasPlus && mobile.length === 10) mobile = "91" + mobile;

      const params = new URLSearchParams({
        authkey: apiKey,
        mobiles: mobile,
        message: text,
        sender: from,
        route: "4",
        country: "91",
      });

      const res = await fetch(
        `https://api.msg91.com/api/sendhttp.php?${params.toString()}`,
        { method: "GET" }
      );
      const resText = await res.text();
      if (!res.ok) {
        return NextResponse.json({ error: `MSG91 HTTP ${res.status}: ${resText}` }, { status: 502 });
      }

      const upper = resText.trim().toUpperCase();
      if (upper.startsWith("ERROR") || upper.includes("INVALID") || upper.includes("FAIL")) {
        return NextResponse.json({ error: `MSG91 rejected the request: ${resText.trim()}` }, { status: 502 });
      }

      await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { smsSent: 1 } }, { upsert: true });
      return NextResponse.json({ ok: true, provider: "MSG91", msgId: resText.trim() });
    }

    // ── Plivo ────────────────────────────────────────────────────────────────
    if (provider === "Plivo") {
      if (!accountSid) {
        return NextResponse.json({ error: "Plivo requires Auth ID in the Account SID field." }, { status: 400 });
      }

      const dst = to.replace(/^\+/, "");
      const src = from.replace(/^\+/, "");

      const plivoBody = JSON.stringify({ src, dst, text });
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
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* not JSON */ }

      if (!res.ok) {
        const detail = (data.error as string) || (data.message as string) || rawText || `HTTP ${res.status}`;
        return NextResponse.json({ error: `Plivo: ${detail}` }, { status: 502 });
      }

      const queued = (data.message as string) || "";
      if (queued.toLowerCase().includes("queued") || Array.isArray(data.message_uuid)) {
        await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { smsSent: 1 } }, { upsert: true });
        return NextResponse.json({ ok: true, provider: "Plivo", uuid: (data.message_uuid as string[])?.[0] });
      }
      return NextResponse.json({ error: `Plivo couldn't confirm delivery: ${rawText}` }, { status: 502 });
    }

    return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { Conversation } from "@/lib/models/Conversation";
import { Lead } from "@/lib/models/Lead";
import { authorizeWorkspace } from "@/server/auth/access";
import { platformEnv } from "@/server/services/platform-credentials";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    await connectDB();
    const access = await authorizeWorkspace(req, searchParams.get("agentId"));
    if (!access.ok) return access.response;
    const agentId = access.agentId;
    
    // Find the most recent SMS conversation for this agent
    // Since we don't have a direct "last received SMS" timestamp index on Conversation, 
    // we'll find conversations for this agent on the SMS channel, sort by updated, and look for a lead message.
    const conversations = await Conversation.find({ agentId, channel: "sms" })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    let lastMessage: any = null;
    let senderName = "Unknown";
    let senderPhone = "";

    for (const convo of conversations) {
      // Find the last message in this conversation with role === "lead"
      const leadMessages = (convo.messages || []).filter((m: any) => m.role === "lead");
      if (leadMessages.length > 0) {
        const latest = leadMessages[leadMessages.length - 1];
        if (!lastMessage || new Date(latest.timestamp) > new Date(lastMessage.timestamp)) {
          lastMessage = latest;
          // Get the lead to get their name and phone
          const lead = await Lead.findById(convo.leadId).lean();
          if (lead) {
            senderName = lead.fullName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim();
            senderPhone = lead.phone || "";
          }
        }
      }
    }

    if (!lastMessage) {
      return NextResponse.json({ message: null });
    }

    return NextResponse.json({
      message: {
        text: lastMessage.content,
        timestamp: lastMessage.timestamp,
        senderName,
        senderPhone
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId: requestedAgentId, to } = await req.json();
    await connectDB();
    const access = await authorizeWorkspace(req, requestedAgentId, { minRole: "admin" });
    if (!access.ok) return access.response;
    const agentId = access.agentId;
    if (!to) {
      return NextResponse.json({ error: "to (phone number) is required" }, { status: 400 });
    }
    const env = await platformEnv(agentId);
    const rows = await Setting.find({
      agentId,
      key: { $in: ["smsProvider", "smsApiKey", "smsAccountSid", "smsFrom"] },
    }).lean();
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    const provider   = m.smsProvider   || "Plivo";
    const apiKey     = m.smsApiKey     || (provider === "Plivo" ? env("PLIVO_AUTH_TOKEN") : "");
    const accountSid = m.smsAccountSid || (provider === "Plivo" ? env("PLIVO_AUTH_ID") : "");
    const from       = m.smsFrom       || (provider === "Plivo" ? env("PLIVO_FROM_NUMBER") : "");

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
      const hasPlus = to.trim().startsWith("+");
      let mobile = to.replace(/\D/g, "");
      if (!hasPlus && mobile.length === 10) mobile = "91" + mobile;

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

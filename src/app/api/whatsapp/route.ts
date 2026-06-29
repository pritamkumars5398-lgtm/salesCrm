import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { agentId, to, text } = await req.json() as {
      agentId: string;
      to: string;
      text: string;
    };

    if (!agentId || !to || !text) {
      return NextResponse.json({ error: "agentId, to, and text required" }, { status: 400 });
    }

    // 1. Remove all non-digit characters (including spaces, dashes, '+', etc.)
    let cleanTo = to.replace(/\D/g, "");
    
    // 2. Remove leading '0' if the user entered it (e.g. 07366832927 -> 7366832927)
    if (cleanTo.startsWith("0") && cleanTo.length === 11) {
      cleanTo = cleanTo.substring(1);
    }

    // 3. Auto-append India country code '91' if the number is exactly 10 digits
    if (cleanTo.length === 10) {
      cleanTo = "91" + cleanTo;
    }

    console.log("[WhatsApp] Preparing to send message...");
    console.log("[WhatsApp] Original To:", to, " | Cleaned To:", cleanTo);

    // Fetch WA credentials
    const keys = ["waProvider", "waApiKey", "waSessionId"];
    const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.value; });

    const provider = m.waProvider || "WireWeb";
    const apiKey = m.waApiKey;
    const sessionId = m.waSessionId;

    if (!apiKey || !sessionId) {
      return NextResponse.json(
        { error: "WhatsApp not configured. Go to Settings → WhatsApp and fill in API Key/Access Token and Session ID/Phone Number ID." },
        { status: 400 }
      );
    }

    let response;
    if (provider === "Meta Cloud API") {
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "text",
        text: {
          preview_url: false,
          body: text,
        },
      };
      console.log("[WhatsApp] Sending Payload to Meta:", payload);
      response = await fetch(`https://graph.facebook.com/v20.0/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } else {
      const payload = {
        sessionId: sessionId,
        to: cleanTo,
        text: text,
      };
      console.log("[WhatsApp] Sending Payload to WireWeb:", payload);
      response = await fetch("https://app.wireweb.co.in/api/v1/messages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WhatsApp] ${provider} Error Response:`, errorText);
      return NextResponse.json({ error: `${provider} API error: ${errorText}` }, { status: response.status });
    }

    console.log(`[WhatsApp] ${provider} Success Response: 200 OK`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to send WhatsApp: ${message}` }, { status: 500 });
  }
}

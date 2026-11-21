import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace, deny } from "@/server/auth/access";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { getWhatsAppConfig } from "@/server/services/settings.service";
import { sendWhatsAppMessage } from "@/server/services/whatsapp.service";
import { sendSms } from "@/server/services/sms.service";
import { placeAiCall } from "@/server/services/call.service";

type Channel = "email" | "sms" | "whatsapp" | "voice";

/**
 * POST { agentId, channel, to? } — a customer checks a channel the admin set up,
 * without seeing any key: an email to their own login address, or an SMS /
 * WhatsApp / AI test call to a phone number they type. The provider's own error
 * text stays in the server log; the customer gets a plain message.
 */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({})) as { agentId?: string; channel?: Channel; to?: string };
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;
  const { agentId, user } = access;
  const channel = body.channel;
  if (!channel || !["email", "sms", "whatsapp", "voice"].includes(channel)) return deny(400, "Pick a channel to test.").response;

  const wait = hitRateLimit(`channel-test:${user._id}:${channel}`);
  if (wait) return NextResponse.json({ error: `Too many tests — try again in ${Math.ceil(wait / 60)} min.` }, { status: 429 });

  const to = channel === "email" ? user.email : String(body.to || "").trim();
  if (channel !== "email" && to.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "Enter your phone number with country code, e.g. +91 98765 43210." }, { status: 400 });
  }

  const notReady = NextResponse.json({ error: "This channel isn't set up yet — your admin will set it up." }, { status: 400 });
  try {
    if (channel === "email") {
      const cfg = await getEmailConfig(agentId);
      if (!cfg) return notReady;
      await sendEmail(cfg, to, "Test email from your sales assistant", `Hi ${user.name || ""},\n\nThis is a test email. If you can read it, email outreach is working.\n`);
      return NextResponse.json({ ok: true, message: `Test email sent to ${to}.` });
    }
    if (channel === "whatsapp") {
      const cfg = await getWhatsAppConfig(agentId);
      if (!cfg) return notReady;
      await sendWhatsAppMessage(cfg, to, "Test message from your sales assistant: WhatsApp is working.");
      return NextResponse.json({ ok: true, message: `Test WhatsApp message sent to ${to}.` });
    }
    if (channel === "sms") {
      await sendSms(agentId, to, "Test message from your sales assistant: SMS is working.");
      return NextResponse.json({ ok: true, message: `Test SMS sent to ${to}.` });
    }
    const result = await placeAiCall({ agentId, toNumber: to, isTest: true, req });
    if (!result.ok) {
      console.error("[channels/test] voice:", result.error);
      return NextResponse.json({ error: result.status === 400 && /valid phone|same as your caller/i.test(result.error || "") ? result.error : "The test call couldn't be placed. Your admin can see the reason." }, { status: result.status === 400 ? 400 : 502 });
    }
    return NextResponse.json({ ok: true, message: `Calling ${to} now — pick up to hear your AI agent.` });
  } catch (err) {
    console.error(`[channels/test] ${channel}:`, err);
    const msg = err instanceof Error ? err.message : "";
    if (/not configured|missing/i.test(msg)) return notReady;
    if (/not a valid phone/i.test(msg)) return NextResponse.json({ error: "That phone number doesn't look right. Use the full number with country code." }, { status: 400 });
    return NextResponse.json({ error: "The test couldn't be sent. Your admin can see the reason." }, { status: 502 });
  }
}

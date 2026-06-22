import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import nodemailer from "nodemailer";
import { getEmailConfig, sendEmail } from "@/lib/email-service";

export async function POST(req: Request) {
  await connectDB();
  const { agentId, to, subject, body: emailBody } = await req.json() as {
    agentId: string;
    to: string;
    subject: string;
    body: string;
  };

  if (!agentId || !to || !subject || !emailBody) {
    return NextResponse.json({ error: "agentId, to, subject, body required" }, { status: 400 });
  }

  const cfg = await getEmailConfig(agentId);
  if (!cfg) {
    return NextResponse.json(
      { error: "Email not configured. Go to Settings → Email and fill in SMTP or API credentials." },
      { status: 400 }
    );
  }

  const from = `"${cfg.fromName}" <${cfg.fromAddress}>`;

  try {
    await sendEmail(cfg, to, subject, emailBody);
    return NextResponse.json({ ok: true, provider: cfg.provider, from, to });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Send failed: ${message}` }, { status: 500 });
  }
}

// Test connection (GET)
export async function GET(req: Request) {
  await connectDB();
  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const cfg = await getEmailConfig(agentId);
  if (!cfg) return NextResponse.json({ ok: false, error: "Email not configured" });

  if (cfg.provider !== "SMTP") {
    return NextResponse.json({ ok: true, provider: cfg.provider, message: "API key present — send a test email to verify" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
    await transporter.verify();
    return NextResponse.json({ ok: true, provider: "SMTP", host: cfg.smtpHost, port: cfg.smtpPort });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message });
  }
}

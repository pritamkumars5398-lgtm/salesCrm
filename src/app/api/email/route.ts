import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import nodemailer from "nodemailer";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { Usage } from "@/lib/models/Usage";
import { currentMonth } from "@/lib/utils/date";
import { checkUsageLimit } from "@/lib/usage-check";
import { authorizeWorkspace } from "@/server/auth/access";

export async function POST(req: Request) {
  await connectDB();
  const { agentId: requestedAgentId, to, subject, body: emailBody } = await req.json().catch(() => ({})) as {
    agentId?: string;
    to?: string;
    subject?: string;
    body?: string;
  };
  const access = await authorizeWorkspace(req, requestedAgentId);
  if (!access.ok) return access.response;
  const agentId = access.agentId;

  if (!to || !subject || !emailBody) {
    return NextResponse.json({ error: "to, subject and body are required" }, { status: 400 });
  }

  const canSend = await checkUsageLimit(agentId, "emailsSent", 1);
  if (!canSend) {
    return NextResponse.json({ error: "Plan limit exceeded for Emails." }, { status: 403 });
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
    
    // Increment usage
    const month = currentMonth();
    await Usage.findOneAndUpdate(
      { agentId, month },
      { $inc: { emailsSent: 1 } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, provider: cfg.provider, from, to });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Send failed: ${message}` }, { status: 500 });
  }
}

// Test connection (GET)
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"), { minRole: "admin" });
  if (!access.ok) return access.response;
  const agentId = access.agentId;

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

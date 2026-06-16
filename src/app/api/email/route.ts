import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import nodemailer from "nodemailer";

interface EmailConfig {
  provider: string;
  apiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromAddress: string;
}

async function getEmailConfig(agentId: string): Promise<EmailConfig | null> {
  const keys = [
    "emailProvider", "emailApiKey",
    "smtpHost", "smtpPort", "smtpUser", "smtpPass",
    "smtpFromName", "smtpFrom",
  ];
  const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });

  const provider = m.emailProvider || "SMTP";

  if (provider === "SMTP") {
    if (!m.smtpHost || !m.smtpUser || !m.smtpPass) return null;
    return {
      provider,
      apiKey: "",
      smtpHost: m.smtpHost,
      smtpPort: parseInt(m.smtpPort ?? "587", 10),
      smtpUser: m.smtpUser,
      smtpPass: m.smtpPass,
      fromName: m.smtpFromName || m.smtpUser,
      fromAddress: m.smtpFrom || m.smtpUser,
    };
  }

  if (!m.emailApiKey) return null;
  return {
    provider,
    apiKey: m.emailApiKey,
    smtpHost: "", smtpPort: 587, smtpUser: "", smtpPass: "",
    fromName: m.smtpFromName || "SalesAgent",
    fromAddress: m.smtpFrom || "",
  };
}

async function sendViaSMTP(cfg: EmailConfig, to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });
  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
    to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ""),
  });
}

async function sendViaResend(apiKey: string, from: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function sendViaSendGrid(apiKey: string, from: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function sendViaMailgun(apiKey: string, from: string, to: string, subject: string, html: string) {
  // Mailgun domain is derived from the from address
  const domain = from.split("@")[1];
  const formData = new URLSearchParams({ from, to, subject, html });
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });
  if (!res.ok) throw new Error(await res.text());
}

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

  const html = emailBody.replace(/\n/g, "<br>");
  const from = `"${cfg.fromName}" <${cfg.fromAddress}>`;

  try {
    if (cfg.provider === "SMTP") {
      await sendViaSMTP(cfg, to, subject, html);
    } else if (cfg.provider === "Resend") {
      await sendViaResend(cfg.apiKey, cfg.fromAddress, to, subject, html);
    } else if (cfg.provider === "SendGrid") {
      await sendViaSendGrid(cfg.apiKey, cfg.fromAddress, to, subject, html);
    } else if (cfg.provider === "Mailgun") {
      await sendViaMailgun(cfg.apiKey, cfg.fromAddress, to, subject, html);
    } else {
      return NextResponse.json({ error: `Unknown provider: ${cfg.provider}` }, { status: 400 });
    }

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

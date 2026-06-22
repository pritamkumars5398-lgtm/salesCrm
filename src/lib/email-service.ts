import { Setting } from "@/lib/models/Setting";
import nodemailer from "nodemailer";

export interface EmailConfig {
  provider: string;
  apiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromAddress: string;
}

export async function getEmailConfig(agentId: string): Promise<EmailConfig | null> {
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
    const host = m.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(m.smtpPort || process.env.SMTP_PORT || "587", 10);
    const fromAddr = m.smtpFrom || process.env.SMTP_FROM || m.smtpUser || process.env.SMTP_USER || "";
    const user = m.smtpUser || process.env.SMTP_USER || fromAddr;
    const pass = m.smtpPass || process.env.SMTP_PASS || "";
    if (!user || !pass) return null;
    return {
      provider,
      apiKey: "",
      smtpHost: host,
      smtpPort: port,
      smtpUser: user,
      smtpPass: pass,
      fromName: m.smtpFromName || process.env.SMTP_FROM_NAME || user,
      fromAddress: fromAddr,
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

export async function sendEmail(
  cfg: EmailConfig,
  to: string,
  subject: string,
  body: string,
  htmlFooter: string = ""
) {
  const html = body.replace(/\n/g, "<br>") + htmlFooter;

  if (cfg.provider === "SMTP") {
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
      text: body,
      headers: {
        "List-Unsubscribe": `<mailto:${cfg.fromAddress}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return;
  }

  if (cfg.provider === "Resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.fromAddress, to, subject, html }),
    });
    if (!res.ok) throw new Error(await res.text());
    return;
  }

  if (cfg.provider === "SendGrid") {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: cfg.fromAddress },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return;
  }

  if (cfg.provider === "Mailgun") {
    const domain = cfg.fromAddress.split("@")[1];
    const formData = new URLSearchParams({ from: `"${cfg.fromName}" <${cfg.fromAddress}>`, to, subject, html });
    const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
    if (!res.ok) throw new Error(await res.text());
    return;
  }

  throw new Error(`Unsupported provider: ${cfg.provider}`);
}

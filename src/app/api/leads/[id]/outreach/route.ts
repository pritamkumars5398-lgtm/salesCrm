import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Setting } from "@/lib/models/Setting";
import { Activity } from "@/lib/models/Activity";
import { Conversation } from "@/lib/models/Conversation";
import nodemailer from "nodemailer";

// ── helpers ──────────────────────────────────────────────────────────────────

async function getEmailConfig(agentId: string) {
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
    // Check DB first, fallback to .env
    const host = m.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(m.smtpPort || process.env.SMTP_PORT || "465", 10);
    // From Address doubles as the SMTP login when no explicit username is set,
    // so email works from the Settings UI alone (no .env required).
    const fromAddr = m.smtpFrom || process.env.SMTP_FROM || m.smtpUser || process.env.SMTP_USER;
    const user = m.smtpUser || process.env.SMTP_USER || fromAddr;
    const pass = m.smtpPass || process.env.SMTP_PASS;
    const fromName = m.smtpFromName || process.env.SMTP_FROM_NAME || user || "SalesAgent";

    if (!host || !user || !pass) return null;
    return {
      provider, apiKey: "",
      smtpHost: host, smtpPort: port, smtpUser: user, smtpPass: pass,
      fromName, fromAddress: fromAddr,
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

async function generateEmailAI(lead: {
  fullName: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  company?: string;
  source?: string;
  senderName?: string;
}): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.GROQ_API_KEY ?? "";
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) throw new Error("GROQ_API_KEY is not set in environment.");

  const sourcePhrase =
    lead.source === "LinkedIn" ? "on LinkedIn"
      : lead.source === "Google Maps" || lead.source === "Apify" ? "on Google Maps"
        : lead.source === "JustDial" ? "on JustDial"
          : lead.source === "Referral" ? "through a mutual connection"
            : "recently";

  const prompt = `You are a sales outreach expert. Write a short, warm, personalized cold outreach email.

Lead details:
- Name: ${lead.fullName}
- Job title: ${lead.jobTitle || "N/A"}
- Company: ${lead.company || "N/A"}
- Discovered via: ${lead.source || "online"} (${sourcePhrase})
- Sender name: ${lead.senderName || "our team"}

Rules:
1. Subject line: plain, specific, lowercase-ish and human — like a 1:1 email a real person types. ≤8 words. NEVER use spam-trigger words (free, guarantee, act now, limited time, offer, deal, discount, $$$), NO ALL-CAPS, NO emojis, NO exclamation marks.
2. Body: 3 short paragraphs, conversational, like a personal note — not marketing copy.
   - Para 1: mention you noticed them ${sourcePhrase} and mention one observation based only on the provided data.
   - Do not compliment.
Do not praise.
Do not invent facts.
   - Para 2: one plain sentence on what you help businesses like theirs with. No hype, no superlatives ("best", "revolutionary", "#1"), no statistics you can't back up.
   - Para 3: soft CTA — ask if they're open to a quick 15-min chat. No pressure.
3. Address ${lead.firstName} by first name and if the first name appears to be a business name,
use "Hi there," instead of addressing them by name.
4. Do NOT use generic openers like "I hope this email finds you well".
5. Avoid spammy patterns: no multiple links, no URLs at all, no phone numbers, no "click here", no excessive punctuation, no markdown, no bullet lists.
6. End the body with a sign-off on its own line: "Best,\\n${lead.senderName || "our team"}". Use exactly that name — do NOT invent a name like "Agent 1".
7. Keep total body under 120 words. Plain sentences only.
8. Return ONLY valid JSON (no markdown fences):
{"subject":"<subject>","body":"<body with \\n for line breaks>"}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Groq error: ${await res.text()}`);

    const json = await res.json();
    const raw: string = json.choices?.[0]?.message?.content ?? "";
    let clean = raw.replace(/```json|```/g, "").trim();

    // Extra safety: extract JSON object if there is leading/trailing text
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      clean = clean.substring(start, end + 1);
    }


    try {
      console.log("RAW AI RESPONSE");
      console.log(raw);

      console.log("CLEANED");
      console.log(clean);
      const parsed = JSON.parse(clean);
      if (!parsed.subject || !parsed.body) throw new Error("bad json");

      // Clean up any double-escaped newlines in the body
      parsed.body = parsed.body.replace(/\\n/g, "\n");

      return parsed;
    } catch {
      return { subject: `Connecting`, body: raw };
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) throw new Error("Groq AI timed out. Try a faster model in .env.");
    throw err;
  }
}

async function sendEmail(cfg: Awaited<ReturnType<typeof getEmailConfig>>, to: string, subject: string, body: string, htmlFooter: string = "") {
  if (!cfg) throw new Error("Email not configured");
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
      // Deliverability: a valid List-Unsubscribe header is one of the
      // strongest signals to Gmail that this is legitimate, not spam.
      headers: {
        "List-Unsubscribe": `<mailto:${cfg.fromAddress}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return;
  }

  if (cfg.provider === "Resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.fromAddress, to, subject, html }),
    });
    if (!r.ok) throw new Error(await r.text());
    return;
  }

  if (cfg.provider === "SendGrid") {
    const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: cfg.fromAddress },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });
    if (!r.ok) throw new Error(await r.text());
    return;
  }

  throw new Error(`Unsupported provider: ${cfg.provider}`);
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  await connectDB();

  const lead = await Lead.findById(params.id).lean();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const agentId = String(lead.agentId);
  const body = await req.json().catch(() => ({}));

  // Load email config up front so we can sign the email with the configured
  // "From Name" (e.g. "Coding Of World") instead of a placeholder.
  const cfg = await getEmailConfig(agentId);
  const senderName: string =
    cfg?.fromName || body.senderName || "our team";

  // 1️⃣  Generate AI email
  let subject: string;
  let emailBody: string;
  try {
    ({ subject, body: emailBody } = await generateEmailAI({
      fullName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
      firstName: lead.firstName,
      lastName: lead.lastName,
      jobTitle: lead.jobTitle,
      company: lead.company,
      source: lead.source,
      senderName,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 502 });
  }

  // 2️⃣  Send via configured email provider (non-blocking if not configured)
  let emailSent = false;
  let emailError: string | null = null;

  if (lead.email) {
    if (cfg) {
      try {
        // Build base URL for the buttons
        const protocol = req.headers.get("x-forwarded-proto") || "http";
        const host = req.headers.get("host") || "localhost:3001";
        const baseUrl = `${protocol}://${host}`;

        const interestedUrl = `${baseUrl}/api/leads/${params.id}/response?action=interested`;
        const notInterestedUrl = `${baseUrl}/api/leads/${params.id}/response?action=not_interested`;

        const htmlButtons = `
<br><br>
<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eaeaea; font-family: sans-serif;">
  <p style="font-size: 13px; color: #666;">Are you open to a quick chat?</p>
  <div style="display: flex; gap: 12px; margin-top: 12px;">
    <a href="${interestedUrl}" style="display: inline-block; padding: 10px 18px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">Yes, I'm interested</a>
    <a href="${notInterestedUrl}" style="display: inline-block; padding: 10px 18px; background-color: #f1f5f9; color: #475569; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; border: 1px solid #cbd5e1;">Not right now</a>
  </div>
</div>
`;
        await sendEmail(cfg, lead.email, subject, emailBody, htmlButtons);
        emailSent = true;
      } catch (err: unknown) {
        emailError = err instanceof Error ? err.message : String(err);
      }
    } else {
      emailError = "Email not configured in Settings — email skipped.";
    }
  } else {
    emailError = "Lead has no email address.";
  }

  // 3️⃣  Update lead status
  await Lead.findByIdAndUpdate(params.id, {
    status: "in_outreach",
    pipelineStage: "contacted",
  });

  // 4️⃣  Log activity & Conversation
  try {
    await Activity.create({
      agentId,
      leadId: params.id,
      leadName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
      channel: "email",
      event: emailSent ? "AI Email Sent" : "AI Email Failed/Skipped",
      detail: `Subject: ${subject}\n\n${emailBody}`.slice(0, 2000),
    });

    let convo = await Conversation.findOne({ leadId: params.id, channel: "email" });
    if (!convo) {
      convo = await Conversation.create({
        leadId: params.id,
        agentId,
        channel: "email",
        messages: [],
      });
    }
    convo.messages.push({
      role: "agent",
      content: `Subject: ${subject}\n\n${emailBody}`,
      timestamp: new Date(),
    });
    await convo.save();
  } catch {
    // activity logging is non-critical
  }

  return NextResponse.json({
    ok: true,
    subject,
    body: emailBody,
    emailSent,
    emailError,
    leadId: params.id,
    status: "in_outreach",
  });
}

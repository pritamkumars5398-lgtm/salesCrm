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

async function getLLMConfig(agentId: string) {
  const keys = ["llmProvider", "llmApiKey"];
  const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  return {
    provider: m.llmProvider || "Groq (Llama 3)",
    apiKey: m.llmApiKey || "",
  };
}

async function generateEmailAI(agentId: string, lead: {
  fullName: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  company?: string;
  source?: string;
  senderName?: string;
}): Promise<{ subject: string; body: string }> {
  // Fetch settings config
  const configKeys = [
    "llmProvider", "llmApiKey",
    "businessWebsite", "businessPhone", "businessServices",
    "docLink", "customPrompt"
  ];
  const settingsRows = await Setting.find({ agentId, key: { $in: configKeys } }).lean();
  const settingsMap: Record<string, string> = {};
  settingsRows.forEach((r) => { settingsMap[r.key] = r.value; });

  const apiKey = settingsMap.llmApiKey || process.env.GROQ_API_KEY || "";
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) throw new Error("GROQ_API_KEY is not set in environment or Settings.");

  const businessWebsite = settingsMap.businessWebsite || "";
  const businessPhone = settingsMap.businessPhone || "";
  const businessServices = settingsMap.businessServices || "";
  const docLink = settingsMap.docLink || "";
  const customPrompt = settingsMap.customPrompt || "";

  let businessContext = "";
  if (businessServices) {
    businessContext += `Our Business Services: ${businessServices}\n`;
  }
  if (businessWebsite) {
    businessContext += `Our Website: ${businessWebsite}\n`;
  }
  if (businessPhone) {
    businessContext += `Our Phone Number: ${businessPhone}\n`;
  }
  if (docLink) {
    businessContext += `Our Resource Document Link: ${docLink} (You can share this link if it fits contextually)\n`;
  }
  if (customPrompt) {
    businessContext += `Important Custom Guidelines/Instructions you must follow:\n${customPrompt}\n`;
  }

  const sourcePhrase =
    lead.source === "LinkedIn" ? "on LinkedIn"
      : lead.source === "Google Maps" || lead.source === "Apify" ? "on Google Maps"
        : lead.source === "JustDial" ? "on JustDial"
          : lead.source === "Referral" ? "through a mutual connection"
            : "recently";

  const prompt = `You are a sales outreach expert. Write a short, warm, personalized cold outreach email.
${businessContext ? `Business context and instructions:\n${businessContext}\n` : ""}
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
   - Para 2: one plain sentence on what you help businesses like theirs with using our services/business description. No hype, no superlatives.
   - Para 3: soft CTA — ask if they're open to a quick 15-min chat. No pressure.
3. Address ${lead.firstName} by first name and if the first name appears to be a business name,
use "Hi there," instead of addressing them by name.
4. Do NOT use generic openers like "I hope this email finds you well".
5. Avoid spammy patterns: no multiple links, no URLs at all except our Website or Resource Document Link if contextually relevant, no phone numbers, no "click here", no excessive punctuation, no markdown, no bullet lists.
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

// ── WhatsApp helpers ──────────────────────────────────────────────────────────

async function getWhatsAppConfig(agentId: string) {
  const rows = await Setting.find({ agentId, key: { $in: ["waProvider", "waApiKey", "waSessionId"] } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });
  if (!m.waApiKey || !m.waSessionId) return null;
  return { provider: m.waProvider || "WireWeb", apiKey: m.waApiKey, sessionId: m.waSessionId };
}

async function generateWhatsAppAI(agentId: string, lead: {
  fullName: string; firstName: string; company?: string;
  source?: string; senderName?: string;
}): Promise<string> {
  const configKeys = ["llmApiKey", "businessServices", "businessWebsite", "customPrompt"];
  const rows = await Setting.find({ agentId, key: { $in: configKeys } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });

  const apiKey = m.llmApiKey || process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const services = m.businessServices || "";
  const website = m.businessWebsite || "";
  const custom = m.customPrompt || "";

  const prompt = `Write a short, friendly WhatsApp outreach message (under 80 words).
Lead: ${lead.fullName}${lead.company ? `, ${lead.company}` : ""}.
${services ? `We offer: ${services}.` : ""}
${website ? `Our website: ${website}.` : ""}
${custom ? `Instructions: ${custom}` : ""}
Sender name: ${lead.senderName || "our team"}.

Rules:
- Conversational, warm, not salesy. Address them by first name (${lead.firstName}).
- One soft CTA asking if they'd like a quick chat.
- No HTML, no links, no emojis unless natural.
- End with: "– ${lead.senderName || "our team"}"
- Return ONLY the message text, no JSON, no quotes.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 200,
    }),
  });
  if (!res.ok) throw new Error(`Groq error: ${await res.text()}`);
  const json = await res.json();
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

async function sendWhatsAppMessage(config: { provider: string; apiKey: string; sessionId: string }, to: string, text: string) {
  let phone = to.replace(/\D/g, "");
  if (phone.length === 10) phone = "91" + phone;

  if (config.provider === "Meta Cloud API") {
    const res = await fetch(`https://graph.facebook.com/v20.0/${config.sessionId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: {
          preview_url: false,
          body: text,
        },
      }),
    });
    if (!res.ok) throw new Error(`Meta API error: ${await res.text()}`);
  } else {
    const res = await fetch("https://app.wireweb.co.in/api/v1/messages", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: config.sessionId, to: phone, text }),
    });
    if (!res.ok) throw new Error(`WhatsApp API error: ${await res.text()}`);
  }
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
  const cfg = await getEmailConfig(agentId);
  const senderName: string = cfg?.fromName || body.senderName || "our team";

  const useWhatsApp = !lead.email && !!(lead.phone || (lead as any).whatsappLid);

  // ── Branch A: lead has email → send email ────────────────────────────────
  if (!useWhatsApp) {
    let subject: string;
    let emailBody: string;
    try {
      ({ subject, body: emailBody } = await generateEmailAI(agentId, {
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

    let emailSent = false;
    let emailError: string | null = null;

    if (lead.email) {
      if (cfg) {
        try {
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
</div>`;
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

    await Lead.findByIdAndUpdate(params.id, { status: "in_outreach", pipelineStage: "contacted" });

    try {
      await Activity.create({
        agentId, leadId: params.id,
        leadName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
        channel: "email",
        event: emailSent ? "AI Email Sent" : "AI Email Failed/Skipped",
        detail: `Subject: ${subject}\n\n${emailBody}`.slice(0, 2000),
      });
      let convo = await Conversation.findOne({ leadId: params.id, channel: "email" });
      if (!convo) convo = await Conversation.create({ leadId: params.id, agentId, channel: "email", messages: [] });
      convo.messages.push({ role: "agent", content: `Subject: ${subject}\n\n${emailBody}`, timestamp: new Date() });
      await convo.save();
    } catch { /* non-critical */ }

    return NextResponse.json({ ok: true, subject, body: emailBody, emailSent, emailError, leadId: params.id, status: "in_outreach" });
  }

  // ── Branch B: no email → send WhatsApp ───────────────────────────────────
  let waMessage: string;
  try {
    waMessage = await generateWhatsAppAI(agentId, {
      fullName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
      firstName: lead.firstName,
      company: lead.company,
      source: lead.source,
      senderName,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI generation failed: ${msg}` }, { status: 502 });
  }

  let whatsappSent = false;
  let whatsappError: string | null = null;

  const waCfg = await getWhatsAppConfig(agentId);
  if (!waCfg) {
    whatsappError = "WhatsApp not configured — add API key and Session ID in Settings.";
  } else {
    const target = lead.phone || (lead as any).whatsappLid;
    try {
      await sendWhatsAppMessage(waCfg, target, waMessage);
      whatsappSent = true;
    } catch (err: unknown) {
      whatsappError = err instanceof Error ? err.message : String(err);
    }
  }

  await Lead.findByIdAndUpdate(params.id, { status: "in_outreach", pipelineStage: "contacted" });

  try {
    await Activity.create({
      agentId, leadId: params.id,
      leadName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
      channel: "whatsapp",
      event: whatsappSent ? "AI WhatsApp Sent (email fallback)" : "AI WhatsApp Failed/Skipped",
      detail: waMessage.slice(0, 2000),
    });
    let convo = await Conversation.findOne({ leadId: params.id, channel: "whatsapp" });
    if (!convo) convo = await Conversation.create({ leadId: params.id, agentId, channel: "whatsapp", messages: [] });
    convo.messages.push({ role: "agent", content: waMessage, timestamp: new Date() });
    await convo.save();
  } catch { /* non-critical */ }

  return NextResponse.json({
    ok: true,
    channel: "whatsapp",
    body: waMessage,
    whatsappSent,
    whatsappError,
    emailError: "No email address — sent via WhatsApp instead",
    leadId: params.id,
    status: "in_outreach",
  });
}

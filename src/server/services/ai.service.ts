import { getLLMConfig, getBusinessContext } from "./settings.service";

export interface OutreachLeadInfo {
  fullName: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  company?: string;
  source?: string;
  senderName?: string;
}

async function callGroq(
  agentId: string,
  prompt: string,
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const llm = await getLLMConfig(agentId);
  if (!llm) throw new Error("LLM API key is not configured (Settings → AI or GROQ_API_KEY).");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.model,
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 512,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Groq error: ${await res.text()}`);
    const json = await res.json();
    return (json.choices?.[0]?.message?.content ?? "").trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) throw new Error("AI generation timed out.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function buildBusinessContextBlock(ctx: Awaited<ReturnType<typeof getBusinessContext>>): string {
  let block = "";
  if (ctx.businessServices) block += `Our Business Services: ${ctx.businessServices}\n`;
  if (ctx.businessWebsite) block += `Our Website: ${ctx.businessWebsite}\n`;
  if (ctx.businessPhone) block += `Our Phone Number: ${ctx.businessPhone}\n`;
  if (ctx.docLink) block += `Our Resource Document Link: ${ctx.docLink} (You can share this link if it fits contextually)\n`;
  if (ctx.customPrompt) block += `Important Custom Guidelines/Instructions you must follow:\n${ctx.customPrompt}\n`;
  return block;
}

function sourcePhraseFor(source?: string): string {
  return source === "LinkedIn" ? "on LinkedIn"
    : source === "Google Maps" || source === "Apify" ? "on Google Maps"
      : source === "JustDial" ? "on JustDial"
        : source === "Referral" ? "through a mutual connection"
          : "recently";
}

export async function generateOutreachEmail(
  agentId: string,
  lead: OutreachLeadInfo
): Promise<{ subject: string; body: string }> {
  const ctx = await getBusinessContext(agentId);
  const businessContext = buildBusinessContextBlock(ctx);
  const sourcePhrase = sourcePhraseFor(lead.source);

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

  const raw = await callGroq(agentId, prompt, { json: true });

  let clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    clean = clean.substring(start, end + 1);
  }

  try {
    const parsed = JSON.parse(clean);
    if (!parsed.subject || !parsed.body) throw new Error("bad json");
    parsed.body = parsed.body.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return { subject: "Connecting", body: raw };
  }
}

export async function generateWhatsAppMessage(
  agentId: string,
  lead: OutreachLeadInfo
): Promise<string> {
  const ctx = await getBusinessContext(agentId);

  const prompt = `Write a short, friendly WhatsApp outreach message (under 80 words).
Lead: ${lead.fullName}${lead.company ? `, ${lead.company}` : ""}.
${ctx.businessServices ? `We offer: ${ctx.businessServices}.` : ""}
${ctx.businessWebsite ? `Our website: ${ctx.businessWebsite}.` : ""}
${ctx.customPrompt ? `Instructions: ${ctx.customPrompt}` : ""}
Sender name: ${lead.senderName || "our team"}.

Rules:
- Conversational, warm, not salesy. Address them by first name (${lead.firstName}).
- One soft CTA asking if they'd like a quick chat.
- No HTML, no links, no emojis unless natural.
- End with: "– ${lead.senderName || "our team"}"
- Return ONLY the message text, no JSON, no quotes.`;

  return callGroq(agentId, prompt, { temperature: 0.5, maxTokens: 200 });
}

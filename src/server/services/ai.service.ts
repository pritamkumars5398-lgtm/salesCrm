import { getLLMConfig, getBusinessContext } from "./settings.service";

export interface OutreachLeadInfo {
  fullName: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  company?: string;
  source?: string;
  location?: string;
  website?: string;
  senderName?: string;
}

/** Compact bullet list of the specific facts we actually know about this lead. */
function leadFactsBlock(lead: OutreachLeadInfo, sourcePhrase: string): string {
  const facts: string[] = [];
  if (lead.company) facts.push(`- Business name: ${lead.company}`);
  if (lead.jobTitle) facts.push(`- Business type / role: ${lead.jobTitle}`);
  if (lead.location) facts.push(`- City / area: ${lead.location}`);
  if (lead.website) facts.push(`- Website: ${lead.website}`);
  facts.push(`- How we found them: ${lead.source || "online"} (${sourcePhrase})`);
  return facts.join("\n");
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
  const facts = leadFactsBlock(lead, sourcePhrase);

  const prompt = `You are writing a 1:1 cold outreach email from one real person to another. It must read like it was written by hand specifically for THIS business — never like a template blasted to many people.

WHO WE ARE (use this to say what we help with — do not dump it verbatim):
${businessContext || "(No business details provided — keep the value proposition generic but human.)"}
Sender name: ${lead.senderName || "our team"}

WHO WE'RE WRITING TO (personalize using these exact facts):
${facts}

PERSONALIZATION (most important):
- Open by referring to THEIR specific business by name (${lead.company || "their business"})${lead.location ? ` in ${lead.location}` : ""} and what they do (${lead.jobTitle || "their line of work"}). The first line must be unique to this business, not reusable for anyone else.
- Connect what we offer to what a business like theirs would actually care about.
- Only use facts provided above. Never invent details, numbers, or compliments.

HARD BANS (these make it look mass-sent — never use them):
- "I hope this email finds you well", "hope you're doing well", "I hope you are doing great"
- "We came across your business", "I stumbled upon", "I wanted to reach out"
- Generic praise like "impressive", "amazing work", "love what you do"

FORMAT:
1. Subject: plain, specific, lowercase-ish, ≤8 words, like a person types. No spam words (free, offer, deal, discount), NO ALL-CAPS, no emojis, no exclamation marks.
2. Body: 3 short paragraphs, under 110 words total, plain sentences.
   - Para 1: the personalized opener above.
   - Para 2: one plain sentence on what we help businesses like theirs with.
   - Para 3: soft CTA — ask if they're open to a quick 15-min chat. No pressure.
3. Address ${lead.firstName} by first name; if that looks like a business name, use "Hi there,".
4. No URLs except our Website if truly relevant. No phone numbers, no "click here", no markdown, no bullet lists.
5. End with a sign-off on its own line: "Best,\\n${lead.senderName || "our team"}".
6. Return ONLY valid JSON (no markdown fences):
{"subject":"<subject>","body":"<body with \\n for line breaks>"}`;

  const raw = await callGroq(agentId, prompt, { json: true, temperature: 0.75 });

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
  const businessContext = buildBusinessContextBlock(ctx);
  const sourcePhrase = sourcePhraseFor(lead.source);
  const facts = leadFactsBlock(lead, sourcePhrase);

  const prompt = `Write a short, friendly WhatsApp outreach message (under 55 words) that reads like a real person typed it just for THIS business — not a template sent to everyone.

WHO WE ARE (use to say what we help with; don't dump verbatim):
${businessContext || "(No business details provided — keep it human and generic.)"}
Sender name: ${lead.senderName || "our team"}

WHO WE'RE MESSAGING (personalize with these exact facts):
${facts}

RULES:
- Open by naming THEIR specific business (${lead.company || "their business"})${lead.location ? ` in ${lead.location}` : ""} and what they do (${lead.jobTitle || "their work"}). The opening line must be unique to this business.
- Address them by first name (${lead.firstName}); if that looks like a business name, skip the name and greet warmly.
- One plain sentence connecting what we do to a business like theirs, then one soft CTA asking if they're open to a quick chat.
- Only use the facts above — never invent details or compliments.
- NEVER use: "hope you're doing well", "we came across your business", "hope this message finds you", generic praise.
- Conversational and warm, not salesy. No links unless truly relevant. No markdown. Emojis only if natural (at most one).
- End with: "– ${lead.senderName || "our team"}"
- Return ONLY the message text — no JSON, no quotes, no preamble.`;

  return callGroq(agentId, prompt, { temperature: 0.8, maxTokens: 220 });
}

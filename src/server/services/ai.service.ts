import { getLLMConfig } from "./settings.service";
import { resolveGroqModel, groqModelParams } from "@/lib/llm";
import { getPlaybook, businessBrief, aiFillInstructions } from "./playbook.service";
import { getFieldDefs } from "./lead-groups.service";

export interface OutreachLeadInfo {
  fullName: string;
  firstName: string;
  lastName?: string;
  jobTitle?: string;
  company?: string;
  source?: string;
  location?: string;
  website?: string;
  notes?: string[];
  senderName?: string;
  /** custom field values + tags (bullet lines) */
  facts?: string;
  /** guidance from the lead's groups */
  groupGuidance?: string;
}

async function fetchWebsiteText(url: string): Promise<string | null> {
  if (!url) return null;
  const targetUrl = url.startsWith('http') ? url : `https://${url}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(targetUrl, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const html = await res.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let content = bodyMatch ? bodyMatch[1] : html;
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    content = content.replace(/<[^>]+>/g, ' ');
    content = content.replace(/\s+/g, ' ').trim();
    return content.slice(0, 1500);
  } catch (err) {
    return null;
  }
}

/** Compact bullet list of the specific facts we actually know about this lead. */
function leadFactsBlock(lead: OutreachLeadInfo, sourcePhrase: string): string {
  const facts: string[] = [];
  if (lead.company) facts.push(`- Business name: ${lead.company}`);
  if (lead.jobTitle) facts.push(`- Business type / role: ${lead.jobTitle}`);
  if (lead.location) facts.push(`- City / area: ${lead.location}`);
  if (lead.website) {
    facts.push(`- Website: ${lead.website}`);
  } else {
    facts.push(`- Website: NONE (They do not have a website currently)`);
  }
  facts.push(`- How we found them: ${lead.source || "online"} (${sourcePhrase})`);
  if (lead.notes && lead.notes.length > 0) {
    facts.push(`- Additional CRM Notes:`);
    lead.notes.forEach(note => facts.push(`  * ${note}`));
  }
  if (lead.facts) facts.push(lead.facts);
  return facts.join("\n");
}

function groupGuidanceBlock(lead: OutreachLeadInfo): string {
  return lead.groupGuidance ? `\nHOW TO APPROACH THIS LEAD (from the groups they're in):\n${lead.groupGuidance}\n` : "";
}

export async function callGroq(
  agentId: string,
  prompt: string,
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const llm = await getLLMConfig(agentId);
  if (!llm) throw new Error("LLM API key is not configured (Settings → AI or GROQ_API_KEY).");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const isOpenAi = (llm.provider.includes("OpenAI") || llm.provider.includes("GPT")) && !llm.apiKey.startsWith("gsk_");
    const endpoint = isOpenAi 
      ? "https://api.openai.com/v1/chat/completions" 
      : "https://api.groq.com/openai/v1/chat/completions";
    const selectedModel = isOpenAi ? (llm.model || "gpt-4o-mini") : resolveGroqModel(llm.model);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: selectedModel,
        ...(isOpenAi ? {} : groqModelParams(selectedModel)),
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 512,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`${isOpenAi ? "OpenAI" : "Groq"} error: ${await res.text()}`);
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
  const playbook = await getPlaybook(agentId);
  const sourcePhrase = sourcePhraseFor(lead.source);
  const facts = leadFactsBlock(lead, sourcePhrase);

  const prompt = `You are writing a 1:1 cold outreach email from one real person to another. It must read like it was written by hand specifically for THIS business — never like a template blasted to many people.

WHO WE ARE (use this to say what we help with — do not dump it verbatim):
${businessBrief(playbook)}
Sender name: ${lead.senderName || "our team"}

WHO WE'RE WRITING TO (personalize using these exact facts):
${facts}
${groupGuidanceBlock(lead)}
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
   - Para 3: soft CTA towards our goal (${playbook.callGoal || "a quick 15-min chat"}). No pressure.
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
  const playbook = await getPlaybook(agentId);
  const sourcePhrase = sourcePhraseFor(lead.source);
  const facts = leadFactsBlock(lead, sourcePhrase);

  let websiteAnalysisContext = "";
  if (lead.website) {
    const websiteText = await fetchWebsiteText(lead.website);
    if (websiteText) {
      websiteAnalysisContext = `\nWEBSITE CONTENT (First 1500 chars of their live site):\n"${websiteText}"\n`;
    }
  }

  const prompt = `Write a short, friendly WhatsApp outreach message (under 65 words) that reads like a real person typed it quickly on their phone just for THIS business.

WHO WE ARE (use to say what we help with; don't dump verbatim):
${businessBrief(playbook)}
Sender name: ${lead.senderName || "our team"}

WHO WE'RE MESSAGING (personalize with these exact facts):
${facts}
${websiteAnalysisContext}${groupGuidanceBlock(lead)}
RULES FOR HUMAN-LIKE WRITING:
- NO AI BUZZWORDS. BANNED WORDS: "elevate", "leverage", "seamlessly", "tailored", "unlock", "synergy", "testament", "delve", "comprehensive", "innovative".
- NEVER start with a generic "I noticed your business". Vary your openings. Example openings: "Hey [Name], came across [Company]...", "Was just looking at [Company]'s profile...", "Quick question about [Company]...".
- Keep it extremely casual and punchy. Write like you are texting a peer.
- FORMATTING: Separate your ideas with line breaks (blank lines) for readability. Do not output a single massive block of text. Put a blank line before the sign-off.
- Do NOT sound like a marketer or a bot. Don't use perfect, rigid grammar. 
- ANALYSIS STEP: Deeply analyze everything provided. Find the ONE problem that what WE offer (above) actually solves for a business like theirs. Only mention their website (or that they have none) if our offer is about websites/online presence.
- State CONCRETELY what we do, using only what WE offer above, but do it conversationally. Never pitch something we don't sell.
- Then one soft CTA towards our goal (${playbook.callGoal || "a quick chat"}).
- NEVER use: "hope you're doing well", "hope this message finds you".
- Emojis only if natural (at most one).
- End with a sign-off: "– ${lead.senderName || "our team"}"
- Return ONLY the message text — no JSON, no quotes, no preamble.`;

  // Increased temperature slightly to 0.85 to encourage more varied and creative text structures
  return callGroq(agentId, prompt, { temperature: 0.85, maxTokens: 220 });
}

export type CallOutcome =
  | "interested" | "meeting_requested" | "callback_requested"
  | "not_interested" | "wrong_number" | "no_decision";

export interface CallAnalysis {
  /** values for AI-fillable custom fields the lead revealed (keyed by field key) */
  fields: Record<string, unknown>;
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  outcome: CallOutcome;
  /** the lead asked for details on WhatsApp, or the agent promised to send them */
  whatsappFollowUp: boolean;
  /** what the WhatsApp message should cover (their need, agreed time…) */
  followUpTopic: string;
}

const CALL_OUTCOMES: CallOutcome[] = [
  "interested", "meeting_requested", "callback_requested", "not_interested", "wrong_number", "no_decision",
];

/** Summarize a finished call and classify how the lead responded. */
export async function analyzeCallTranscript(
  agentId: string,
  transcript: { role: "agent" | "lead"; content: string }[]
): Promise<CallAnalysis> {
  const lines = transcript
    .map((t) => `${t.role === "agent" ? "AGENT" : "LEAD"}: ${t.content}`)
    .join("\n")
    .slice(-12000);

  const fillHelp = aiFillInstructions(await getFieldDefs(agentId));
  const prompt = `You are reviewing the transcript of an outbound sales phone call made by an AI agent.

TRANSCRIPT:
${lines}

Judge ONLY from what the LEAD actually said. Do not infer interest the lead did not express.
- outcome: one of ${CALL_OUTCOMES.map((o) => `"${o}"`).join(", ")}
  - "meeting_requested" only if the lead agreed to a meeting/demo/visit
  - "callback_requested" if the lead asked to be called later
  - "wrong_number" if the lead says they are not the person/business
  - "no_decision" if the lead barely spoke or nothing was decided
- sentiment: the lead's overall tone — "positive", "neutral" or "negative"
- summary: 1–2 plain sentences a salesperson can read at a glance (what was discussed, what's next). Always write the summary in English, even if the call was in Hindi or Hinglish.
- whatsapp_follow_up: true if the lead asked for details/information on WhatsApp, OR the agent said details would be sent on WhatsApp, OR a meeting/callback was agreed; otherwise false
- follow_up_topic: if whatsapp_follow_up is true, a short English phrase of what the message should cover (their need and any agreed day/time), else ""
${fillHelp ? `- fields: ${fillHelp}\n` : ""}
Return ONLY valid JSON: {"summary":"...","sentiment":"...","outcome":"...","whatsapp_follow_up":false,"follow_up_topic":""${fillHelp ? ',"fields":{}' : ""}}`;

  const raw = await callGroq(agentId, prompt, { json: true, temperature: 0.2, maxTokens: 300 });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const parsed = JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : raw);

  const sentiment = ["positive", "neutral", "negative"].includes(parsed.sentiment) ? parsed.sentiment : "neutral";
  const outcome = CALL_OUTCOMES.includes(parsed.outcome) ? parsed.outcome : "no_decision";
  return {
    fields: parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields) ? parsed.fields : {},
    summary: String(parsed.summary || "").slice(0, 600),
    sentiment,
    outcome,
    whatsappFollowUp: parsed.whatsapp_follow_up === true || parsed.whatsapp_follow_up === "true",
    followUpTopic: String(parsed.follow_up_topic || "").slice(0, 300),
  };
}

/**
 * Short WhatsApp message to send a lead after (or during) a call. Links and
 * contact details are appended by the caller — this only writes the message.
 */
export async function generateCallFollowUpWhatsApp(
  agentId: string,
  input: { leadName: string; company?: string; topic: string; language: string; senderName: string }
): Promise<string> {
  const playbook = await getPlaybook(agentId);
  const lang = input.language === "English"
    ? "simple English"
    : "natural Hinglish written in Roman script (the way Indians text on WhatsApp), keeping business words in English";
  const prompt = `Write a short WhatsApp message (max 60 words) to ${input.leadName}${input.company && input.company !== input.leadName ? ` of ${input.company}` : ""}, sent right after a phone call with them.

What it should cover: ${input.topic || "a thank-you and our details, as discussed on the call"}
We are ${playbook.brandName}. What we offer (pick only what fits the topic): ${[playbook.offerSummary, playbook.businessServices].filter(Boolean).join(" — ").replace(/\s*\n\s*/g, ", ").slice(0, 700)}

Rules:
- Write in ${lang}.
- Start by referring to the call ("as discussed on the call" or similar), then 1–2 sentences on how we can help them specifically. If a day/time was agreed, confirm it.
- No links, phone numbers or email addresses — they are added below the message automatically.
- At most one emoji. No hashtags, no markdown, no sign-off line.
- Return ONLY the message text.`;
  return (await callGroq(agentId, prompt, { temperature: 0.6, maxTokens: 220 })).trim().replace(/^"|"$/g, "");
}

/**
 * Daily follow-up email to a lead who hasn't replied. Written from the
 * workspace's own playbook so each business line follows up about its own offer.
 */
export async function generateFollowUpEmail(
  agentId: string,
  input: { leadName: string; company?: string; history: string; followUpNum: number; facts?: string; groupGuidance?: string },
): Promise<{ subject: string; body: string }> {
  const playbook = await getPlaybook(agentId);
  const prompt = `You are an expert sales representative sending follow-up #${input.followUpNum} to a lead who hasn't replied to your previous message.

WHO WE ARE:
${businessBrief(playbook, { detailChars: 800 })}

LEAD:
- Name: ${input.leadName}
- Company: ${input.company || "N/A"}
${input.facts || ""}
${input.groupGuidance ? `\nHOW TO APPROACH THIS LEAD:\n${input.groupGuidance}\n` : ""}
CONVERSATION SO FAR (most recent last):
${input.history.slice(-6000)}

Instructions:
1. Write a brief, friendly follow-up email. Not pushy, not repetitive — 2-3 sentences, add one new angle instead of repeating the last message.
2. Move towards our goal: ${playbook.callGoal || "a short call with our team"}.${playbook.docLink ? ` If it fits and we haven't shared it yet, include ${playbook.docLink}.` : ""}
3. Subject: a reply-style subject ("Re: …") or a short friendly one.
4. Body under 100 words, sign-off "Best,\\n${playbook.brandName}".

Return ONLY valid JSON: {"subject": "...", "body": "..."}`;
  const raw = await callGroq(agentId, prompt, { json: true, temperature: 0.4, maxTokens: 300 });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const parsed = JSON.parse(start !== -1 && end > start ? raw.slice(start, end + 1) : raw);
  if (!parsed.body) throw new Error("LLM returned no follow-up body");
  return { subject: String(parsed.subject || "Following up"), body: String(parsed.body).replace(/\\n/g, "\n") };
}

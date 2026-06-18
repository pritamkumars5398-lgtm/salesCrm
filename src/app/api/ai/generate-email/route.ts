import { NextResponse } from "next/server";

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export interface GenerateEmailRequest {
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle?: string;
  company?: string;
  source?: string; // LinkedIn | Google Maps | JustDial | Manual | Apify | Referral
  senderName?: string; // name of the person/company reaching out
}

export interface GenerateEmailResponse {
  subject: string;
  body: string;
}

function buildPrompt(data: GenerateEmailRequest): string {
  const sourcePhrase =
    data.source === "LinkedIn"
      ? "on LinkedIn"
      : data.source === "Google Maps" || data.source === "Apify"
      ? "on Google Maps"
      : data.source === "JustDial"
      ? "on JustDial"
      : data.source === "Referral"
      ? "through a mutual connection"
      : "recently";

  const role = data.jobTitle ? `who is the ${data.jobTitle}` : "";
  const atCompany = data.company ? `at ${data.company}` : "";

  return `You are a sales outreach expert. Write a short, warm, personalized cold outreach email.

Lead details:
- Name: ${data.fullName}
- Job title: ${data.jobTitle || "N/A"}
- Company: ${data.company || "N/A"}
- Discovered via: ${data.source || "online"}
- Our sender: ${data.senderName || "our team"}

Rules:
1. Subject line: plain, specific, human — like a 1:1 email a real person types. ≤8 words. NEVER use spam-trigger words (free, guarantee, act now, limited time, offer, deal, discount, $$$), NO ALL-CAPS, NO emojis, NO exclamation marks.
2. Body: 3 short paragraphs, conversational, like a personal note — not marketing copy.
   - Para 1: mention you saw them ${sourcePhrase} and one genuine, specific compliment about their work/company.
   - Para 2: one plain sentence on what you help businesses like theirs with. No hype, no superlatives ("best", "revolutionary", "#1"), no statistics you can't back up.
   - Para 3: soft CTA — ask if they're open to a quick 15-minute chat. No pressure.
3. Address ${data.firstName} by first name only.
4. Do NOT use generic filler phrases like "I hope this email finds you well".
5. Avoid spammy patterns: no multiple links, no URLs at all, no phone numbers, no "click here", no excessive punctuation, no markdown, no bullet lists.
6. End the body with a sign-off on its own line: "Best,\\n${data.senderName || "our team"}". Use exactly that name — do NOT invent a name like "Agent 1".
7. Keep total body under 120 words. Plain sentences only.
8. Return ONLY valid JSON in this exact shape, no markdown, no extra text:
{"subject":"<subject here>","body":"<body here with \\n for line breaks>"}`;
}

export async function POST(req: Request) {
  if (!GROQ_API_KEY) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not set in environment variables." },
      { status: 500 }
    );
  }

  const data: GenerateEmailRequest = await req.json();

  if (!data.fullName) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }

  const prompt = buildPrompt(data);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: `Groq error: ${errText}` },
      { status: 502 }
    );
  }

  const json = await res.json();
  const raw: string = json.choices?.[0]?.message?.content ?? "";

  // Parse the JSON returned by the model
  try {
    // Strip any accidental markdown fences
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed: GenerateEmailResponse = JSON.parse(clean);
    if (!parsed.subject || !parsed.body) throw new Error("Missing fields");
    return NextResponse.json(parsed);
  } catch {
    // Fallback — return the raw text so the caller can still use it
    return NextResponse.json({
      subject: `Quick hello from ${data.senderName || "us"}`,
      body: raw,
    });
  }
}

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { text, agentId } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    let apiKey = process.env.GROQ_API_KEY || "";
    if (agentId) {
      const setting = await Setting.findOne({ agentId, key: "llmApiKey" }).lean();
      if (setting?.value) {
        apiKey = setting.value;
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured in environment or settings." },
        { status: 400 }
      );
    }

    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    const prompt = `You are an expert sales assistant. Your job is to extract lead information from the provided raw text and return a structured JSON array of leads.

Fields to extract:
- firstName: string (If not available, infer or use "Unknown")
- lastName: string (If not available, infer or use "Unknown")
- email: string (If not found, use empty string "")
- phone: string (If not found, use empty string "")
- jobTitle: string (If not found, use empty string "")
- company: string (If not found, use empty string "")
- website: string (If not found, use empty string "")
- source: string (Infer from text if possible, e.g. "LinkedIn", "Google Maps", "JustDial", "Referral", or default to "Manual")

Rules:
1. Return ONLY a valid JSON array of objects. Do not wrap in markdown code blocks, do not include any explanatory text.
2. Keep lead data accurate. Do not invent details.
3. If no leads are found, return an empty array [].

Text to parse:
"""
${text}
"""`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
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

    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid response from AI (not an array)" }, { status: 502 });
      }
      return NextResponse.json(parsed);
    } catch (e) {
      console.error("AI parsing failed", raw, e);
      return NextResponse.json({ error: "Failed to parse AI response as JSON array" }, { status: 502 });
    }
  } catch (err: any) {
    console.error("Parse leads API error", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

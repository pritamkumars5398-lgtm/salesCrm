import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace } from "@/server/auth/access";
import { getVoiceConfig, getLLMConfig } from "@/server/services/settings.service";
import { generateGeminiSpeech } from "@/server/services/gemini-voice.service";
import { callGroq } from "@/server/services/ai.service";

export async function POST(req: Request) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const { agentId, text, history = [], prompt = "", voiceId = "Aoede" } = body;

    const access = await authorizeWorkspace(req, agentId);
    if (!access.ok) return access.response;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    const cfg = await getVoiceConfig(access.agentId);
    const geminiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY;

    // 1. Build prompt for conversation turn
    const systemPrompt = `${prompt || "You are a professional, polite AI sales representative speaking with a lead on the phone."}

## How to reply in this phone call:
- Keep every reply to 1–2 short, natural conversational sentences.
- Speak in the language the lead uses (Hindi, Hinglish, or English).
- Do NOT use markdown, emojis, bullet points, asterisks, or quotes. Output ONLY plain spoken dialogue.
- Be polite, listen, answer their question directly, and guide towards a short meeting or callback.`;

    const formattedHistory = history
      .filter((h: any) => h.role === "agent" || h.role === "you")
      .slice(-6)
      .map((h: any) => `${h.role === "agent" ? "Agent" : "Lead"}: ${h.text}`)
      .join("\n");

    const fullTurnPrompt = `${systemPrompt}

## Conversation so far:
${formattedHistory}
Lead: ${text.trim()}
Agent:`;

    // 2. Generate conversational reply with workspace LLM
    let replyText = "";
    try {
      replyText = await callGroq(access.agentId, fullTurnPrompt, {
        temperature: 0.35,
        maxTokens: 120,
      });
      // Clean any accidental prefixes
      replyText = replyText.replace(/^(Agent:\s*|AI:\s*)+/i, "").trim();
    } catch (llmErr) {
      console.warn("[PracticeChat] LLM fallback error:", llmErr);
      replyText = "जी बिल्कुल, मैं समझ सकती हूँ। क्या आप मुझे थोड़ा और बता सकते हैं ताकि मैं आपको सही जानकारी दे सकूँ?";
    }

    // 3. Generate Gemini Voice Audio
    let audioBase64: string | null = null;
    try {
      const selectedVoice = voiceId || cfg.voiceId || "Aoede";
      const audioBuffer = await generateGeminiSpeech(replyText, {
        apiKey: geminiKey,
        voice: selectedVoice,
        model: cfg.geminiVoiceModel || "gemini-2.5-flash-native-audio-preview-12-2025",
      });
      audioBase64 = audioBuffer.toString("base64");
    } catch (voiceErr) {
      console.error("[PracticeChat] Gemini audio generation error:", voiceErr);
    }

    return NextResponse.json({
      text: replyText,
      audioBase64,
    });
  } catch (err: any) {
    console.error("[PracticeChat] Error in practice chat:", err);
    return NextResponse.json({ error: err.message || "Failed to process turn." }, { status: 500 });
  }
}

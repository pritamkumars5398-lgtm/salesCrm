require("dotenv").config({ path: ".env" });
const WebSocket = require("ws");
const OpenAI = require("openai");
const mongoose = require("mongoose");
const url = require("url");

// --- MongoDB Setup ---
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env!");
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log("🔌 Connected to MongoDB for Voice Settings"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// Define Setting Model natively so this standalone server can query it
const SettingSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
});
const Setting = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);

const wss = new WebSocket.Server({ port: 8080 });
console.log("🚀 Real-Time Voice Server running on ws://localhost:8080");

wss.on("connection", async (clientWs, req) => {
  console.log("✅ New client connected to Voice Server");

  // 1. Extract agentId from URL query string (e.g. ?agentId=xyz)
  const parsedUrl = url.parse(req.url, true);
  const agentId = parsedUrl.query.agentId;

  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) {
    console.error("Invalid or missing agentId in WS connection");
    clientWs.send(JSON.stringify({ type: "error", message: "Invalid agentId" }), () => {
      clientWs.close();
    });
    return;
  }

  // 2. Fetch API Keys from MongoDB Settings for this specific agent
  let llmApiKey, sttApiKey, voiceApiKey, voiceId, llmProvider, voiceProvider;
  try {
    const settings = await Setting.find({ agentId: new mongoose.Types.ObjectId(agentId) });
    const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});

    llmApiKey = settingsMap.llmApiKey;
    llmProvider = settingsMap.llmProvider || "GPT-4o (OpenAI)";
    sttApiKey = settingsMap.sttApiKey;
    voiceApiKey = settingsMap.voiceApiKey;
    voiceProvider = settingsMap.voiceProvider || "ElevenLabs";

    // We pull the Voice ID from your database settings. 
    // If you use a custom Library Voice, your ElevenLabs account MUST be upgraded.
    voiceId = settingsMap.voiceId;
  } catch (err) {
    console.error("Failed to fetch settings from MongoDB:", err);
    clientWs.close();
    return;
  }

  if (!llmApiKey || !sttApiKey || (voiceProvider === "ElevenLabs" && !voiceApiKey)) {
    const missing = [];
    if (!llmApiKey) missing.push("LLM API Key (Groq)");
    if (!sttApiKey) missing.push("STT API Key (Deepgram)");
    if (voiceProvider === "ElevenLabs" && !voiceApiKey) missing.push("Voice API Key (ElevenLabs)");

    console.error(`Agent ${agentId} is missing keys: ${missing.join(", ")}`);
    clientWs.send(JSON.stringify({ type: "error", message: `Missing API keys: ${missing.join(", ")}. Please save them in CRM Settings.` }), () => {
      clientWs.close();
    });
    return;
  }

  // 3. Initialize AI Clients with dynamic keys and providers
  let openaiConfig = { apiKey: llmApiKey };
  let llmModel = "gpt-4o-mini";

  if (llmProvider?.includes("Groq") || (llmApiKey && llmApiKey.startsWith("gsk_"))) {
    openaiConfig.baseURL = "https://api.groq.com/openai/v1";
    llmModel = "llama-3.1-8b-instant"; // Extremely fast Groq model perfect for real-time voice
  }

  const openai = new OpenAI(openaiConfig);

  let dgLive = null;
  let elevenWs = null;

  // --- 4. Setup ElevenLabs ---
  function connectElevenLabs() {
    if (voiceProvider !== "ElevenLabs") return;

    const elevenUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId || 'pNInz6obpgDQGcFmaJgB'}/stream-input?model_id=eleven_turbo_v2_5`;
    elevenWs = new WebSocket(elevenUrl);

    elevenWs.on("open", () => {
      console.log("🟢 Connected to ElevenLabs");
      elevenWs.send(JSON.stringify({
        text: " ",
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        xi_api_key: voiceApiKey,
      }));
    });

    elevenWs.on("message", (data) => {
      const response = JSON.parse(data);
      if (response.error || response.message) {
        console.error("ElevenLabs API Error:", response);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "error", message: `ElevenLabs Error: ${response.error || response.message}` }));
        }
      }
      if (response.audio && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "audio_out", data: response.audio }));
      }
    });

    elevenWs.on("close", () => console.log("🔴 ElevenLabs connection closed"));
    elevenWs.on("error", (err) => {
      console.error("ElevenLabs Error:", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: `ElevenLabs Connection Error: ${err.message}` }));
      }
    });
  }

  connectElevenLabs();

  // --- 5. Setup Deepgram WebSocket ---
  const deepgramWsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&endpointing=500`;
  dgLive = new WebSocket(deepgramWsUrl, {
    headers: {
      Authorization: `Token ${sttApiKey}`
    }
  });

  let currentAbortController = null;

  async function processLLMAndTTS(transcript) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "transcript", text: transcript }));
    }

    // Cancel any ongoing generation
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const { signal } = currentAbortController;

    try {
      const stream = await openai.chat.completions.create({
        model: llmModel,
        messages: [
          {
            role: "system",
            content: "You are a highly realistic, conversational human sales agent on a phone call. DO NOT sound like an AI. Keep your answers extremely brief (1 or 2 sentences max). Speak casually and naturally. Occasionally use filler words like 'Umm...', 'Uh...', or 'Hmm...' at the start or middle of sentences to mimic natural human thought processes. Use casual language and contractions."
          },
          { role: "user", content: transcript }
        ],
        stream: true,
      });

      console.log("🤖 Agent (thinking...)");
      let aiFullResponse = "";

      for await (const chunk of stream) {
        if (signal.aborted) {
          console.log("🛑 Generation aborted due to interruption.");
          break;
        }
        const textChunk = chunk.choices[0]?.delta?.content || "";
        if (textChunk) {
          aiFullResponse += textChunk;
          if (voiceProvider === "ElevenLabs" && elevenWs && elevenWs.readyState === WebSocket.OPEN) {
            elevenWs.send(JSON.stringify({ text: textChunk }));
          }
        }
      }

      console.log("🤖 Agent full response:", aiFullResponse);

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "agent_text", text: aiFullResponse, provider: voiceProvider }));
      }

      if (voiceProvider === "ElevenLabs") {
        if (elevenWs && elevenWs.readyState === WebSocket.OPEN) {
          elevenWs.send(JSON.stringify({ text: "" }));
        }
      } else if (voiceProvider === "Deepgram") {
        // --- Deepgram Aura TTS API ---
        try {
          const response = await fetch(`https://api.deepgram.com/v1/speak?model=${voiceId || 'aura-asteria-en'}`, {
            method: 'POST',
            headers: {
              'Authorization': `Token ${sttApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: aiFullResponse })
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Deepgram TTS Error: ${response.status} - ${errorData}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64Audio = buffer.toString('base64');

          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "audio_out", data: base64Audio }));
          }
        } catch (dgErr) {
          console.error("Deepgram TTS REST Error:", dgErr);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: "error", message: dgErr.message }));
          }
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log("🛑 OpenAI stream aborted.");
        return;
      }
      console.error("OpenAI Error:", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: `AI Brain Error: ${err.message}` }));
      }
    } finally {
      if (currentAbortController?.signal === signal) {
        currentAbortController = null;
      }
    }
  }

  dgLive.on("message", async (rawData) => {
    const data = JSON.parse(rawData.toString());
    if (data.type !== "Results") return;

    const transcript = data.channel.alternatives[0].transcript;
    if (transcript.trim()) {
      if (data.is_final) {
        console.log("👤 User:", transcript);
        await processLLMAndTTS(transcript);
      } else {
        // User is currently speaking (intermediate result). Interrupt the AI.
        if (currentAbortController) {
          currentAbortController.abort();
        }
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "interruption" }));
        }
      }
    }
  });

  dgLive.on("error", (err) => console.error("Deepgram Error:", err));

  let audioBuffer = [];

  // --- 7. Handle incoming audio from Browser ---
  clientWs.on("message", (msg) => {
    try {
      const message = JSON.parse(msg);
      if (message.type === "audio_in") {
        const buffer = Buffer.from(message.data, "base64");
        if (dgLive && dgLive.readyState === WebSocket.OPEN) {
          dgLive.send(buffer);
        } else if (dgLive && dgLive.readyState === WebSocket.CONNECTING) {
          audioBuffer.push(buffer);
        }
      } else if (message.type === "text_in") {
        console.log("👤 User (text):", message.text);
        processLLMAndTTS(message.text);
      }
    } catch (err) {
      console.error("Error processing browser message:", err);
    }
  });

  dgLive.on("open", () => {
    console.log("🟢 Connected to Deepgram");
    while (audioBuffer.length > 0) {
      dgLive.send(audioBuffer.shift());
    }
  });
  clientWs.on("close", () => {
    console.log("🔴 Client disconnected");
    if (dgLive) dgLive.close();
    if (elevenWs) elevenWs.close();
  });
});

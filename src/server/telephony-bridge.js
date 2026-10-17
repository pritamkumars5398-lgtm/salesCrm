/**
 * Real-Time Telephony Bridge: Plivo <-> ElevenLabs Conversational AI
 * Bridges Plivo's bidirectional G.711 mu-law 8kHz audio stream directly to
 * ElevenLabs Conversational AI WebSocket with zero transcoding latency.
 *
 * Persists live transcripts and call analytics to MongoDB Conversation & Activity models.
 */

const WebSocket = require("ws");
const mongoose = require("mongoose");
const url = require("url");

// Ensure MongoDB Models are available
function getModels() {
  const SettingSchema = new mongoose.Schema({
    agentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    key: { type: String, required: true },
    value: { type: String, required: true },
  });

  const MessageSchema = new mongoose.Schema({
    role: { type: String, enum: ["agent", "lead"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed },
  }, { _id: false });

  const ConversationSchema = new mongoose.Schema({
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
    channel: { type: String, enum: ["email", "whatsapp", "sms", "call"], required: true },
    messages: [MessageSchema],
  }, { timestamps: true });

  const ActivitySchema = new mongoose.Schema({
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
    leadName: { type: String, required: true },
    channel: { type: String, enum: ["email", "whatsapp", "sms", "call", "system"], required: true },
    event: { type: String, required: true },
    detail: { type: String },
  }, { timestamps: { createdAt: true, updatedAt: false } });

  const LeadSchema = new mongoose.Schema({
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    fullName: { type: String },
    company: { type: String },
    phone: { type: String },
    status: { type: String },
    pipelineStage: { type: String },
    lastContactedAt: { type: Date },
    outreachAttempts: { type: Number, default: 0 },
    history: [{
      field: String,
      from: String,
      to: String,
      by: String,
      at: { type: Date, default: Date.now },
      note: String,
    }],
  }, { timestamps: true });

  return {
    Setting: mongoose.models.Setting || mongoose.model("Setting", SettingSchema),
    Conversation: mongoose.models.Conversation || mongoose.model("Conversation", ConversationSchema),
    Activity: mongoose.models.Activity || mongoose.model("Activity", ActivitySchema),
    Lead: mongoose.models.Lead || mongoose.model("Lead", LeadSchema),
  };
}

/**
 * Handles incoming Plivo WebSocket connection
 */
async function handlePlivoStream(plivoWs, req) {
  const parsedUrl = url.parse(req.url, true);
  const agentId = parsedUrl.query.agentId;
  const leadId = parsedUrl.query.leadId;

  console.log(`[TelephonyBridge] New Plivo stream incoming. Agent: ${agentId}, Lead: ${leadId}`);

  const startTime = Date.now();
  let streamId = null;
  let callId = null;
  let elevenWs = null;
  const transcripts = [];

  const { Setting, Conversation, Activity, Lead } = getModels();

  let lead = null;
  let settingsMap = {};

  try {
    if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
      lead = await Lead.findById(leadId);
    }
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
      const rows = await Setting.find({ agentId: new mongoose.Types.ObjectId(agentId) });
      settingsMap = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    }
  } catch (err) {
    console.error("[TelephonyBridge] Failed to load DB context:", err.message);
  }

  // Resolve ElevenLabs credentials
  const elevenApiKey = settingsMap.voiceApiKey || process.env.ELEVENLABS_API_KEY;
  const elevenAgentId = settingsMap.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID;

  if (!elevenApiKey || !elevenAgentId) {
    console.error("[TelephonyBridge] Missing ElevenLabs API Key or Agent ID!");
    plivoWs.close();
    return;
  }

  // Connect to ElevenLabs Conversational AI WebSocket
  function connectElevenLabs() {
    const convAiUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${elevenAgentId}`;
    console.log(`[TelephonyBridge] Connecting to ElevenLabs Conversational AI (${elevenAgentId})...`);

    elevenWs = new WebSocket(convAiUrl, {
      headers: {
        "xi-api-key": elevenApiKey,
      },
    });

    elevenWs.on("open", () => {
      console.log("[TelephonyBridge] Connected to ElevenLabs Conversational AI!");

      // Send initiation data with dynamic lead context
      const leadName = lead?.fullName || lead?.firstName || "Valued Client";
      const leadCompany = lead?.company || "Company";

      const initPayload = {
        type: "conversation_initiation_client_data",
        conversation_config_override: {
          agent: {
            prompt: {
              prompt: settingsMap.callScript || "You are an intelligent, friendly AI sales agent for DIFMO. Qualify the client, understand their needs, and book a discovery meeting.",
            },
            first_message: settingsMap.callGreeting 
              ? settingsMap.callGreeting.replace("{{leadName}}", leadName)
              : `Hello ${leadName}! This is calling from the sales team. How are you doing today?`,
            language: "en",
          },
        },
        dynamic_variables: {
          lead_name: leadName,
          company_name: leadCompany,
          phone: lead?.phone || "",
        },
      };

      elevenWs.send(JSON.stringify(initPayload));
    });

    elevenWs.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        // 1. Audio stream from ElevenLabs -> forward to Plivo caller
        if (data.type === "audio" && data.audio_event?.audio_base_64) {
          if (plivoWs.readyState === WebSocket.OPEN) {
            plivoWs.send(JSON.stringify({
              event: "playAudio",
              media: {
                payload: data.audio_event.audio_base_64,
              },
            }));
          }
        }

        // 2. Interruption event -> user started speaking, clear Plivo playback buffer
        if (data.type === "interruption") {
          console.log("[TelephonyBridge] User interruption detected! Clearing Plivo audio buffer.");
          if (plivoWs.readyState === WebSocket.OPEN) {
            plivoWs.send(JSON.stringify({ event: "clearAudio" }));
          }
        }

        // 3. User spoken transcript turn
        if (data.type === "user_transcript") {
          const text = data.user_transcription_event?.user_transcript;
          if (text) {
            console.log(`[TelephonyBridge] Callee: "${text}"`);
            transcripts.push({
              role: "lead",
              content: text,
              timestamp: new Date(),
              meta: { type: "transcript" },
            });
          }
        }

        // 4. Agent response transcript turn
        if (data.type === "agent_response") {
          const text = data.agent_response_event?.agent_response;
          if (text) {
            console.log(`[TelephonyBridge] ElevenLabs Agent: "${text}"`);
            transcripts.push({
              role: "agent",
              content: text,
              timestamp: new Date(),
              meta: { type: "transcript" },
            });
          }
        }
      } catch (err) {
        console.error("[TelephonyBridge] Error parsing ElevenLabs event:", err.message);
      }
    });

    elevenWs.on("error", (err) => {
      console.error("[TelephonyBridge] ElevenLabs WebSocket Error:", err.message);
    });

    elevenWs.on("close", () => {
      console.log("[TelephonyBridge] ElevenLabs connection closed.");
    });
  }

  connectElevenLabs();

  // Handle messages incoming from Plivo stream
  plivoWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.event === "start") {
        streamId = msg.start?.streamId || msg.streamId;
        callId = msg.start?.callId;
        console.log(`[TelephonyBridge] Plivo Stream Started. StreamId: ${streamId}, CallId: ${callId}`);
      } else if (msg.event === "media") {
        const payload = msg.media?.payload;
        if (payload && elevenWs && elevenWs.readyState === WebSocket.OPEN) {
          // Stream raw 8kHz mu-law audio chunk directly to ElevenLabs ConvAI
          elevenWs.send(JSON.stringify({
            user_audio_chunk: payload,
          }));
        }
      } else if (msg.event === "stop") {
        console.log(`[TelephonyBridge] Plivo Stream Stopped. StreamId: ${streamId}`);
        cleanUpAndSave();
      }
    } catch (err) {
      console.error("[TelephonyBridge] Error handling Plivo message:", err.message);
    }
  });

  plivoWs.on("close", () => {
    console.log("[TelephonyBridge] Plivo WebSocket disconnected.");
    cleanUpAndSave();
  });

  plivoWs.on("error", (err) => {
    console.error("[TelephonyBridge] Plivo WebSocket Error:", err.message);
    cleanUpAndSave();
  });

  let isCleanedUp = false;
  async function cleanUpAndSave() {
    if (isCleanedUp) return;
    isCleanedUp = true;

    if (elevenWs && elevenWs.readyState === WebSocket.OPEN) {
      try { elevenWs.close(); } catch {}
    }

    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[TelephonyBridge] Call finished. Duration: ${durationSeconds}s. Transcripts: ${transcripts.length}`);

    // Persist conversation and activities to MongoDB
    if (leadId && agentId) {
      try {
        if (transcripts.length > 0) {
          await Conversation.findOneAndUpdate(
            { leadId: new mongoose.Types.ObjectId(leadId), agentId: new mongoose.Types.ObjectId(agentId), channel: "call" },
            {
              $push: {
                messages: { $each: transcripts },
              },
            },
            { upsert: true, new: true }
          );
        }

        await Activity.create({
          agentId: new mongoose.Types.ObjectId(agentId),
          leadId: new mongoose.Types.ObjectId(leadId),
          leadName: lead?.fullName || "Lead",
          channel: "call",
          event: "AI Voice Call Completed (Plivo + ElevenLabs)",
          detail: `Call duration: ${durationSeconds} seconds. Transcripts recorded: ${transcripts.length} exchanges.`,
        });

        if (lead) {
          lead.lastContactedAt = new Date();
          lead.history.push({
            field: "call",
            from: "in_call",
            to: "completed",
            by: "ElevenLabs AI Agent",
            at: new Date(),
            note: `Duration: ${durationSeconds}s. Turns: ${transcripts.length}`,
          });

          if (transcripts.length > 2 && (lead.pipelineStage === "new" || lead.pipelineStage === "contacted")) {
            lead.pipelineStage = "replied";
          }
          await lead.save();
        }

        console.log("[TelephonyBridge] Successfully saved transcripts & activities to MongoDB.");
      } catch (dbErr) {
        console.error("[TelephonyBridge] Error persisting call data to MongoDB:", dbErr.message);
      }
    }
  }
}

module.exports = {
  handlePlivoStream,
};

/**
 * Real-Time Telephony Bridge: Plivo <-> ElevenLabs Conversational AI
 *
 * Plivo streams the answered call as G.711 mu-law 8kHz over a bidirectional
 * WebSocket; this bridge relays it to an ElevenLabs Conversational AI session
 * and plays the agent's audio back. Audio is transcoded only when the ElevenLabs
 * agent isn't configured for mu-law 8kHz (e.g. its default pcm_16000).
 *
 * Every connection must carry the callId + token created when the call was
 * dispatched (see src/server/services/call.service.ts). Transcript turns are
 * persisted as they happen; when the stream closes the Next app is notified so
 * it can analyze the call and update the lead.
 *
 * Uses raw MongoDB collections (not mongoose models) so it never registers
 * partial schemas that would shadow the app's real models in this process.
 */

const WebSocket = require("ws");
const mongoose = require("mongoose");
const crypto = require("crypto");
const liveListen = require("./live-listen");

const ELEVEN_API = "https://api.elevenlabs.io/v1/convai";
const ELEVEN_CONNECT_TIMEOUT_MS = 15000;
/** After the agent finishes, wait at most this long for queued audio to play before hanging up. */
const PLAYBACK_DRAIN_TIMEOUT_MS = 10000;
const END_CHECKPOINT = "end-of-call";

// ── G.711 mu-law codec + resampling ─────────────────────────────────────────

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;
const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  let t = ((u & 0x0f) << 3) + MULAW_BIAS;
  t <<= (u & 0x70) >> 4;
  MULAW_DECODE_TABLE[i] = u & 0x80 ? MULAW_BIAS - t : t - MULAW_BIAS;
}

function encodeMulawSample(sample) {
  const sign = sample < 0 ? 0x80 : 0;
  let s = Math.min(Math.abs(sample), MULAW_CLIP) + MULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function mulawToPcm(buf) {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = MULAW_DECODE_TABLE[buf[i]];
  return out;
}

function pcmToMulaw(samples) {
  const out = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = encodeMulawSample(samples[i]);
  return out;
}

function resample(input, fromRate, toRate) {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  if (ratio > 1) {
    // Downsample: average the source samples each output sample covers (cheap low-pass).
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      out[i] = end > start ? Math.round(sum / (end - start)) : input[start] || 0;
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const idx = Math.floor(pos);
      const a = input[idx];
      const b = idx + 1 < input.length ? input[idx + 1] : a;
      out[i] = Math.round(a + (b - a) * (pos - idx));
    }
  }
  return out;
}

function pcmBufferToSamples(buf) {
  const samples = new Int16Array(Math.floor(buf.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(i * 2);
  return samples;
}

function samplesToPcmBuffer(samples) {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], i * 2);
  return buf;
}

/** "pcm_16000" → { codec: "pcm", rate: 16000 }; "ulaw_8000" → { codec: "ulaw", rate: 8000 } */
function parseAudioFormat(name) {
  const m = /^(pcm|ulaw)_(\d+)$/.exec(String(name || ""));
  return m ? { codec: m[1], rate: parseInt(m[2], 10) } : { codec: "pcm", rate: 16000 };
}

const isPlivoNative = (fmt) => fmt.codec === "ulaw" && fmt.rate === 8000;

/** Plivo mu-law 8k (base64) → ElevenLabs input format (base64). */
function plivoToEleven(b64, fmt) {
  if (isPlivoNative(fmt)) return b64;
  const pcm = resample(mulawToPcm(Buffer.from(b64, "base64")), 8000, fmt.rate);
  return (fmt.codec === "ulaw" ? pcmToMulaw(pcm) : samplesToPcmBuffer(pcm)).toString("base64");
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function ensureDb() {
  const conn = mongoose.connection;
  if (conn.readyState === 1) return;
  if (conn.readyState === 2) {
    await conn.asPromise();
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(process.env.MONGODB_URI);
}

const col = (name) => mongoose.connection.collection(name);

function tokenMatches(expected, given) {
  if (!expected || !given) return false;
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function loadSettings(agentId) {
  const rows = await col("settings").find({ agentId }).toArray();
  const m = {};
  for (const r of rows) m[r.key] = r.value;
  const provider = m.callProvider || "Plivo";
  const maxDuration = parseInt(m.callMaxDuration || "", 10);
  return {
    plivoAuthId: m.plivoAuthId || process.env.PLIVO_AUTH_ID || "",
    // Same rule as getVoiceConfig: a legacy callApiKey only counts if it looks like a Plivo token.
    plivoAuthToken: m.plivoAuthToken || (provider === "Plivo" && /^[A-Za-z0-9]{40}$/.test(m.callApiKey || "") ? m.callApiKey : "") || process.env.PLIVO_AUTH_TOKEN || "",
    elevenAgentId: String(m.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID || "").trim(),
    elevenApiKey: String(m.voiceApiKey || process.env.ELEVENLABS_API_KEY || "").trim(),
    callScript: String(m.callScript || "").trim(),
    callGreeting: String(m.callGreeting || "").trim(),
    language: ["Hindi", "Hinglish", "English"].includes(m.callLanguage) ? m.callLanguage : "",
    businessServices: String(m.businessServices || "").trim(),
    businessWebsite: String(m.businessWebsite || "").trim(),
    customPrompt: String(m.customPrompt || "").trim(),
    maxDurationMin: Number.isFinite(maxDuration) && maxDuration > 0 ? Math.min(maxDuration, 60) : 5,
  };
}

function emitLeadUpdate(leadId) {
  if (leadId && global._eventEmitter) global._eventEmitter.emit("message", { leadId: String(leadId) });
}

function internalAppUrl() {
  return (process.env.INTERNAL_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

// ── Plivo REST helpers ──────────────────────────────────────────────────────

function plivoAuthHeader(cfg) {
  return `Basic ${Buffer.from(`${cfg.plivoAuthId}:${cfg.plivoAuthToken}`).toString("base64")}`;
}

async function plivoHangup(cfg, callUuid) {
  if (!callUuid || !cfg.plivoAuthId || !cfg.plivoAuthToken) return false;
  try {
    const res = await fetch(`https://api.plivo.com/v1/Account/${cfg.plivoAuthId}/Call/${callUuid}/`, {
      method: "DELETE",
      headers: { Authorization: plivoAuthHeader(cfg) },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.error("[TelephonyBridge] Plivo hangup failed:", err.message);
    return false;
  }
}

async function plivoSpeak(cfg, callUuid, text, language = "en-IN") {
  if (!callUuid || !cfg.plivoAuthId || !cfg.plivoAuthToken) return;
  try {
    await fetch(`https://api.plivo.com/v1/Account/${cfg.plivoAuthId}/Call/${callUuid}/Speak/`, {
      method: "POST",
      headers: { Authorization: plivoAuthHeader(cfg), "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "Polly.Aditi", language }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { /* best effort */ }
}

// ── ElevenLabs helpers ──────────────────────────────────────────────────────

/** Signed URL for private agents; null (with reason) when it can't be obtained. */
async function getElevenSignedUrl(cfg) {
  let reason = null;
  for (const path of ["get-signed-url", "get_signed_url"]) {
    try {
      const res = await fetch(`${ELEVEN_API}/conversation/${path}?agent_id=${encodeURIComponent(cfg.elevenAgentId)}`, {
        headers: { "xi-api-key": cfg.elevenApiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.signed_url) return { url: data.signed_url };
      } else {
        reason = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
        if (res.status === 401) break; // bad API key — the other path won't help
      }
    } catch (err) {
      reason = err.message;
    }
  }
  return { url: null, reason };
}

function fillTemplate(text, vars) {
  return text
    .replace(/\{\{\s*leadName\s*\}\}/gi, vars.lead_name)
    .replace(/\{\{\s*company(Name)?\s*\}\}/gi, vars.company_name)
    .replace(/\{\{\s*businessType\s*\}\}/gi, vars.business_type)
    .replace(/\{\{\s*location\s*\}\}/gi, vars.location);
}

/** Per-lead dynamic variables. Google Maps leads store the business name as the person's name. */
function buildLeadVars(lead, call) {
  const person = (lead && (lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(" "))) || "";
  const company = (lead && lead.company) || person || "aapka business";
  const website = (lead && lead.website) || "";
  const ownWebsite = website && !/google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps/i.test(website) ? website : "";
  return {
    lead_name: person && person !== company ? person : company,
    company_name: company,
    business_type: (lead && lead.jobTitle) || "business",
    location: (lead && lead.location) || "",
    website: ownWebsite,
    phone: (lead && lead.phone) || call.to || "",
  };
}

const LANGUAGE_RULES = {
  Hindi: "Speak in natural, conversational Hindi as spoken in India, written in Devanagari script. Keep everyday English business words in English (website, app, online booking, WhatsApp, Google). If the person replies in English, switch to simple English.",
  Hinglish: "Speak natural Hinglish — mostly Hindi with common English words, the way Indian business owners talk on the phone. Write Hindi words in Devanagari. Mirror the language the person uses.",
  English: "Speak clear, simple Indian English. If the person prefers Hindi, switch to Hindi (Devanagari).",
};

const DEFAULT_GREETING = {
  Hindi: "नमस्ते! मैं प्रिया बोल रही हूँ। क्या मेरी बात {{company}} से हो रही है?",
  Hinglish: "नमस्ते! मैं प्रिया बोल रही हूँ। क्या मेरी बात {{company}} से हो रही है?",
  English: "Hello! This is Priya. Am I speaking with {{company}}?",
};

/**
 * Full call instructions: the configured script plus everything we know about
 * this lead and our offering, so the agent talks about THEIR business.
 */
function buildCallPrompt(cfg, vars, lead) {
  const base = cfg.callScript
    ? fillTemplate(cfg.callScript, vars)
    : "You are Priya, a friendly and professional sales representative calling a business owner.";
  const notes = ((lead && lead.notes) || []).slice(-3).map((n) => n && n.text).filter(Boolean);
  const parts = [
    base,
    "## The business you are calling",
    `- Business name: ${vars.company_name}`,
    `- Business type: ${vars.business_type}`,
    vars.location ? `- City / area: ${vars.location}` : null,
    `- Website: ${vars.website || "none found (only a Google Maps listing)"}`,
    vars.lead_name !== vars.company_name ? `- Contact person: ${vars.lead_name}` : null,
    notes.length ? `- Notes from our CRM: ${notes.join(" | ")}` : null,
  ];
  if (cfg.businessServices || cfg.businessWebsite) {
    parts.push("## What we offer");
    if (cfg.businessServices) parts.push(cfg.businessServices.replace(/\s*\n\s*/g, " ").slice(0, 1500));
    if (cfg.businessWebsite) parts.push(`Our website: ${cfg.businessWebsite}`);
  }
  if (cfg.customPrompt) parts.push("## Company guidelines", cfg.customPrompt.slice(0, 1500));
  parts.push(
    "## How to run this call",
    "- This is a live phone call. Keep every reply to 1–2 short sentences, ask one question at a time, and let them speak.",
    `- Talk only about THIS business: ${vars.company_name}, a ${vars.business_type}${vars.location ? ` in ${vars.location}` : ""}. Pick the 2–3 parts of what we offer (above) that matter most to a ${vars.business_type} and explain the benefit for them in plain words. Never read out a list.`,
    "- Never mention any other company or client by name, never offer anything not listed above, and never invent facts about their business.",
    "- Goal: understand their situation, then offer a free 15-minute call with our team. If they agree, confirm a convenient day and time.",
    "- When the lead asks for details/information on WhatsApp, or agrees to a meeting or callback, use the send_whatsapp_details tool with a short topic (what they need and any agreed day/time), then tell them you've sent it. If the tool reports a problem, say our team will share the details shortly. Never say you sent something unless the tool succeeded.",
    "- If they are busy, ask for a better time to call back. If they are not interested, thank them politely and end the call. If it is a wrong number, apologise and end the call.",
    "- If you hear an automated phone menu, hold music or a recorded greeting (\"Press 1…\", \"Welcome to…\", \"Press 0 for operator\"), do not talk to it — end the call immediately.",
    "- Whenever the conversation is over (goodbye, not interested, wrong number, meeting or callback confirmed), say one short goodbye and then use the end_call tool. Never keep the line open in silence.",
  );
  if (cfg.language) parts.push("## Language", LANGUAGE_RULES[cfg.language]);
  return parts.filter(Boolean).join("\n");
}

// ── Bridge ──────────────────────────────────────────────────────────────────

/**
 * Handles one Plivo media-stream WebSocket for the lifetime of a call.
 */
async function handlePlivoStream(plivoWs, req) {
  const query = new URL(req.url, "http://localhost").searchParams;
  const callId = query.get("callId");
  const token = query.get("token");

  // Plivo sends "start" immediately — queue messages until the call context is loaded.
  const queued = [];
  let onPlivoMessage = null;
  let cleanup = null;
  let plivoClosed = false;
  plivoWs.on("message", (raw) => (onPlivoMessage ? onPlivoMessage(raw) : queued.push(raw)));
  plivoWs.on("close", () => { plivoClosed = true; if (cleanup) cleanup("plivo-closed"); });
  plivoWs.on("error", (err) => console.error("[TelephonyBridge] Plivo WebSocket error:", err.message));

  let call, cfg, lead;
  try {
    await ensureDb();
    if (!callId || !mongoose.Types.ObjectId.isValid(callId)) throw new Error("missing or invalid callId");
    call = await col("calls").findOne({ _id: new mongoose.Types.ObjectId(callId) });
    if (!call || !tokenMatches(call.token, token)) throw new Error("unknown call or bad token");
    cfg = await loadSettings(call.agentId);
    if (call.leadId) lead = await col("leads").findOne({ _id: call.leadId });
  } catch (err) {
    console.error("[TelephonyBridge] Rejecting stream:", err.message);
    try { plivoWs.close(1008, "unauthorized"); } catch {}
    return;
  }

  const callObjectId = call._id;
  const leadId = call.leadId || null;
  const vars = buildLeadVars(lead, call);
  console.log(`[TelephonyBridge] Stream connected for call ${callId} (${vars.lead_name})`);

  let streamId = null;
  let plivoCallUuid = call.callUuid || null;
  let elevenWs = null;
  let elevenReady = false;
  let elevenAttempts = 0;
  // 3 = prompt + language + first-message override, 2 = prompt + language,
  // 1 = prompt only, 0 = the agent's own config. Start at 2: the greeting goes
  // in as the {{greeting}} variable; 3 is only tried for agents without it.
  let overrideLevel = 2;
  let agentSpoke = false;
  let inputFormat = null;
  let outputFormat = null;
  let outputCarry = Buffer.alloc(0);
  let conversationId = null;
  let endRequested = false;
  let hangupSent = false;
  let finished = false;
  let bridgeError = null;
  const transcript = Array.isArray(call.transcript) ? [...call.transcript] : [];
  const timers = [];

  const speechLang = cfg.language === "English" ? "en" : cfg.language ? "hi" : null;

  function sendToPlivo(msg) {
    if (plivoWs.readyState === WebSocket.OPEN) plivoWs.send(JSON.stringify(msg));
  }

  function addTurn(role, content) {
    const text = String(content || "").trim();
    // ElevenLabs reports silence / unintelligible audio as "..." — not speech.
    if (!text || /^[\s.…,!?-]*$/.test(text)) return;
    const turn = { role, content: text, timestamp: new Date() };
    transcript.push(turn);
    col("calls")
      .updateOne({ _id: callObjectId }, { $push: { transcript: turn }, $set: { updatedAt: new Date() } })
      .then(() => emitLeadUpdate(leadId))
      .catch((err) => console.error("[TelephonyBridge] Failed to save transcript turn:", err.message));
  }

  /** ElevenLabs output (base64) → Plivo mu-law 8k (base64). Keeps odd PCM bytes for the next chunk. */
  function elevenToPlivo(b64) {
    const fmt = outputFormat || { codec: "pcm", rate: 16000 };
    if (isPlivoNative(fmt)) return b64;
    let buf = Buffer.from(b64, "base64");
    if (fmt.codec === "ulaw") return pcmToMulaw(resample(mulawToPcm(buf), fmt.rate, 8000)).toString("base64");
    if (outputCarry.length) buf = Buffer.concat([outputCarry, buf]);
    outputCarry = buf.length % 2 ? buf.subarray(buf.length - 1) : Buffer.alloc(0);
    return pcmToMulaw(resample(pcmBufferToSamples(buf), fmt.rate, 8000)).toString("base64");
  }

  function buildInitiation() {
    const greeting = call.aiFirstMessage || fillTemplate(cfg.callGreeting || DEFAULT_GREETING[cfg.language || "English"], vars);
    // Agents set up by the CRM open with {{greeting}}, so the greeting travels as a
    // variable — some ElevenLabs accounts refuse a first_message override outright.
    const payload = { type: "conversation_initiation_client_data", dynamic_variables: { ...vars, greeting } };
    if (overrideLevel > 0) {
      // The app builds the prompt from the workspace's playbook when it places the
      // call; the local builder only covers calls placed before that existed.
      const agent = { prompt: { prompt: call.aiPrompt || buildCallPrompt(cfg, vars, lead) } };
      // Older agents with a fixed greeting only change it through the override.
      if (overrideLevel > 2) agent.first_message = greeting;
      if (overrideLevel > 1 && speechLang) agent.language = speechLang;
      payload.conversation_config_override = { agent };
    }
    return payload;
  }

  /** Agent asked (mid-call) to WhatsApp our details to the lead — the Next app sends it. */
  async function sendWhatsAppDetails(topic) {
    try {
      const res = await fetch(`${internalAppUrl()}/api/calls/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, token, topic }),
        signal: AbortSignal.timeout(18000),
      });
      const r = await res.json().catch(() => ({}));
      if (r.ok) {
        console.log(`[TelephonyBridge] WhatsApp details ${r.alreadySent ? "were already sent" : "sent"} for call ${callId}`);
        return { ok: true, text: r.alreadySent ? "Already sent on WhatsApp earlier in this call." : "Sent on WhatsApp — the lead now has our website, booking link and contact details." };
      }
      return { ok: false, text: `Couldn't send the WhatsApp message (${r.error || "unknown error"}). Tell the lead our team will share the details with them shortly.` };
    } catch (err) {
      return { ok: false, text: "Couldn't send the WhatsApp message right now. Tell the lead our team will share the details with them shortly." };
    }
  }

  async function hangupNow() {
    if (hangupSent) return;
    hangupSent = true;
    const ok = await plivoHangup(cfg, plivoCallUuid);
    if (!ok) console.warn(`[TelephonyBridge] Could not hang up call ${plivoCallUuid} via REST; closing stream.`);
    // If Plivo doesn't close the socket promptly, close it ourselves.
    timers.push(setTimeout(() => { try { plivoWs.close(); } catch {} }, ok ? 5000 : 0));
  }

  /** End the call after any queued agent audio has played out. */
  function endCall(errorMessage) {
    if (endRequested || finished) return;
    endRequested = true;
    if (errorMessage) {
      bridgeError = errorMessage;
      console.error(`[TelephonyBridge] Ending call ${callId}: ${errorMessage}`);
    }
    if (!elevenReady) {
      // The callee heard nothing from the agent — apologize instead of hanging up on silence.
      const hindi = speechLang === "hi";
      plivoSpeak(
        cfg,
        plivoCallUuid,
        hindi ? "माफ़ कीजिए, अभी कॉल कनेक्ट नहीं हो पा रही है। हम आपको जल्द ही दोबारा कॉल करेंगे।" : "Sorry, we are unable to connect this call right now. We will call you back shortly.",
        hindi ? "hi-IN" : "en-IN"
      )
        .finally(() => timers.push(setTimeout(hangupNow, 6000)));
      return;
    }
    if (streamId && plivoWs.readyState === WebSocket.OPEN) {
      sendToPlivo({ event: "checkpoint", streamId, name: END_CHECKPOINT });
      timers.push(setTimeout(hangupNow, PLAYBACK_DRAIN_TIMEOUT_MS));
    } else {
      hangupNow();
    }
  }

  async function connectEleven() {
    elevenAttempts++;
    elevenReady = false;
    const signed = await getElevenSignedUrl(cfg);
    if (finished) return;
    if (!signed.url && /HTTP 401/.test(signed.reason || "")) {
      endCall(`ElevenLabs rejected the API key (${signed.reason}).`);
      return;
    }
    const url = signed.url || `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(cfg.elevenAgentId)}`;
    const ws = new WebSocket(url, signed.url ? {} : { headers: { "xi-api-key": cfg.elevenApiKey } });
    elevenWs = ws;
    let lastError = signed.url ? null : signed.reason;

    ws.on("open", () => ws.send(JSON.stringify(buildInitiation())));

    ws.on("message", (raw) => {
      let data;
      try { data = JSON.parse(raw.toString()); } catch { return; }

      switch (data.type) {
        case "conversation_initiation_metadata": {
          const meta = data.conversation_initiation_metadata_event || {};
          conversationId = meta.conversation_id || null;
          inputFormat = parseAudioFormat(meta.user_input_audio_format);
          outputFormat = parseAudioFormat(meta.agent_output_audio_format);
          elevenReady = true;
          console.log(`[TelephonyBridge] ElevenLabs session ${conversationId} (in: ${meta.user_input_audio_format || "pcm_16000"}, out: ${meta.agent_output_audio_format || "pcm_16000"})`);
          if (conversationId) col("calls").updateOne({ _id: callObjectId }, { $set: { elevenConversationId: conversationId } }).catch(() => {});
          break;
        }
        case "audio": {
          agentSpoke = true;
          const b64 = data.audio_event && data.audio_event.audio_base_64;
          if (b64 && !endRequested) {
            const mulaw = elevenToPlivo(b64);
            sendToPlivo({ event: "playAudio", media: { contentType: "audio/x-mulaw", sampleRate: 8000, payload: mulaw } });
            liveListen.broadcastAudio(callId, liveListen.CHANNEL_AGENT, Buffer.from(mulaw, "base64"));
          }
          break;
        }
        case "interruption":
          if (streamId) sendToPlivo({ event: "clearAudio", streamId });
          outputCarry = Buffer.alloc(0);
          liveListen.broadcastControl(callId, { type: "clear" });
          break;
        case "user_transcript":
          addTurn("lead", data.user_transcription_event && data.user_transcription_event.user_transcript);
          break;
        case "agent_response":
          addTurn("agent", data.agent_response_event && data.agent_response_event.agent_response);
          break;
        case "agent_response_correction": {
          // The agent was cut off — keep only what the callee actually heard.
          const corrected = data.agent_response_correction_event && data.agent_response_correction_event.corrected_agent_response;
          for (let i = transcript.length - 1; i >= 0; i--) {
            if (transcript[i].role === "agent") {
              if (corrected) transcript[i] = { ...transcript[i], content: corrected };
              break;
            }
          }
          break;
        }
        case "ping": {
          const eventId = data.ping_event && data.ping_event.event_id;
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pong", event_id: eventId }));
          break;
        }
        case "client_tool_call": {
          const tc = data.client_tool_call || {};
          const reply = (result, isError) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "client_tool_result", tool_call_id: tc.tool_call_id, result, is_error: !!isError }));
          };
          if (!tc.tool_call_id) break;
          if (tc.tool_name === "send_whatsapp_details") {
            sendWhatsAppDetails((tc.parameters && tc.parameters.topic) || "").then((r) => reply(r.text, !r.ok));
          } else {
            reply("Tool not available on phone calls", true);
          }
          break;
        }
        default:
          break;
      }
    });

    ws.on("error", (err) => {
      lastError = err.message;
      console.error("[TelephonyBridge] ElevenLabs WebSocket error:", err.message);
    });

    ws.on("close", (code, reasonBuf) => {
      if (ws !== elevenWs || finished) return;
      const reason = (reasonBuf && reasonBuf.toString()) || lastError || `code ${code}`;
      // ElevenLabs accepts the session (metadata) and only THEN closes it when an
      // override isn't allowed — so "rejected" means closed before the agent spoke.
      if (!agentSpoke && overrideLevel > 0 && elevenAttempts < 3) {
        // Drop the language override first, then all of them.
        elevenReady = false;
        overrideLevel = overrideLevel >= 2 && speechLang ? 1 : 0;
        console.warn(`[TelephonyBridge] ElevenLabs rejected the session (${reason}); retrying with ${overrideLevel ? "prompt/greeting only" : "the agent's own config"}.`);
        bridgeError = overrideLevel
          ? "Call language override was ignored — enable the language override on the ElevenLabs agent (Security tab)."
          : "Lead-specific script, greeting and language were ignored — enable prompt, first message and language overrides on the ElevenLabs agent (Security tab).";
        connectEleven();
        return;
      }
      if (!agentSpoke) {
        endCall(`ElevenLabs session failed: ${reason}`);
      } else {
        console.log(`[TelephonyBridge] ElevenLabs ended the conversation (${reason}).`);
        endCall(null);
      }
    });

    timers.push(setTimeout(() => {
      if (!elevenReady && ws === elevenWs && !finished) {
        try { ws.terminate(); } catch {}
        endCall("ElevenLabs did not respond in time.");
      }
    }, ELEVEN_CONNECT_TIMEOUT_MS));
  }

  cleanup = async (why) => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    if (elevenWs) { try { elevenWs.close(); } catch {} }
    liveListen.endListeners(callId);
    console.log(`[TelephonyBridge] Call ${callId} stream closed (${why}). Turns: ${transcript.length}`);

    try {
      const set = { bridgeEndedAt: new Date(), transcript, updatedAt: new Date() };
      if (conversationId) set.elevenConversationId = conversationId;
      if (bridgeError) set.error = bridgeError.slice(0, 500);
      await col("calls").updateOne({ _id: callObjectId }, { $set: set });
    } catch (err) {
      console.error("[TelephonyBridge] Failed to save call:", err.message);
    }

    try {
      await fetch(`${internalAppUrl()}/api/calls/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, token }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      console.error("[TelephonyBridge] Could not notify app of call end (Plivo's hangup callback will finalize):", err.message);
    }
  };

  onPlivoMessage = (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.event) {
      case "start":
        streamId = (msg.start && msg.start.streamId) || msg.streamId || null;
        plivoCallUuid = (msg.start && msg.start.callId) || plivoCallUuid;
        console.log(`[TelephonyBridge] Plivo stream started (stream ${streamId}, call ${plivoCallUuid})`);
        break;
      case "media": {
        const payload = msg.media && msg.media.payload;
        if (payload) liveListen.broadcastAudio(callId, liveListen.CHANNEL_LEAD, Buffer.from(payload, "base64"));
        if (payload && elevenReady && inputFormat && elevenWs && elevenWs.readyState === WebSocket.OPEN) {
          elevenWs.send(JSON.stringify({ user_audio_chunk: plivoToEleven(payload, inputFormat) }));
        }
        break;
      }
      case "playedStream":
        if (msg.name === END_CHECKPOINT) hangupNow();
        break;
      case "stop":
        cleanup("plivo-stop");
        break;
      default:
        break;
    }
  };
  queued.splice(0).forEach(onPlivoMessage);

  if (plivoClosed) {
    cleanup("plivo-closed-early");
    return;
  }

  timers.push(setTimeout(() => endCall(null), cfg.maxDurationMin * 60 * 1000));
  connectEleven();
}

module.exports = {
  handlePlivoStream,
  // exported for tests
  _codec: { mulawToPcm, pcmToMulaw, resample, plivoToEleven, parseAudioFormat },
  _prompt: { buildLeadVars, buildCallPrompt, fillTemplate, DEFAULT_GREETING },
};

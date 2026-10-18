/**
 * Live call listening: browsers subscribe to /ws/listen?token=… and receive a
 * copy of both sides of a live call as G.711 mu-law 8kHz frames.
 *
 * Wire format (server → browser):
 *  - binary: 1 byte channel (0 = lead/callee, 1 = AI agent) + mu-law bytes
 *  - text JSON: { type: "clear" } (agent interrupted — drop queued agent audio),
 *               { type: "ended" } (call over)
 *
 * Tokens are minted by /api/voice/listen (behind the app's auth) and signed with
 * the same secret here; see src/lib/listen-token.ts.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");

const CHANNEL_LEAD = 0;
const CHANNEL_AGENT = 1;
/** Skip frames for a listener whose socket is this far behind (slow network). */
const MAX_BUFFERED_BYTES = 512 * 1024;

function listenSecret() {
  return process.env.LISTEN_TOKEN_SECRET
    || crypto.createHash("sha256").update(`call-listen:${process.env.MONGODB_URI || ""}`).digest("hex");
}

/** token = "<callId>.<expiresAtMs>.<hmac>" → callId, or null if invalid/expired */
function verifyListenToken(token) {
  const [callId, exp, sig] = String(token || "").split(".");
  if (!callId || !exp || !sig || Number(exp) < Date.now()) return null;
  const expected = crypto.createHmac("sha256", listenSecret()).update(`${callId}.${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? callId : null;
}

// callId -> Set<WebSocket>; global so it survives module reloads in dev.
const listeners = global.__callListeners || (global.__callListeners = new Map());

function send(ws, data) {
  if (ws.readyState !== 1 || ws.bufferedAmount > MAX_BUFFERED_BYTES) return;
  try { ws.send(data); } catch { /* socket closing */ }
}

function broadcastAudio(callId, channel, mulawBuffer) {
  const set = listeners.get(String(callId));
  if (!set || set.size === 0 || !mulawBuffer || mulawBuffer.length === 0) return;
  const frame = Buffer.allocUnsafe(mulawBuffer.length + 1);
  frame[0] = channel;
  mulawBuffer.copy(frame, 1);
  for (const ws of set) send(ws, frame);
}

function broadcastControl(callId, message) {
  const set = listeners.get(String(callId));
  if (!set) return;
  const text = JSON.stringify(message);
  for (const ws of set) send(ws, text);
}

/** Call is over: tell listeners and disconnect them. */
function endListeners(callId) {
  const set = listeners.get(String(callId));
  if (!set) return;
  for (const ws of set) {
    send(ws, JSON.stringify({ type: "ended" }));
    try { ws.close(1000, "call ended"); } catch {}
  }
  listeners.delete(String(callId));
}

/** Handles one browser listener connection. */
async function handleListener(ws, req) {
  const token = new URL(req.url, "http://localhost").searchParams.get("token");
  const callId = verifyListenToken(token);
  if (!callId) {
    try { ws.close(1008, "invalid or expired token"); } catch {}
    return;
  }

  // Register first so no audio is missed while we check the call's state.
  let set = listeners.get(callId);
  if (!set) listeners.set(callId, (set = new Set()));
  set.add(ws);
  ws.on("close", () => {
    set.delete(ws);
    if (set.size === 0 && listeners.get(callId) === set) listeners.delete(callId);
  });

  try {
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(callId)) {
      const call = await mongoose.connection.collection("calls").findOne(
        { _id: new mongoose.Types.ObjectId(callId) },
        { projection: { active: 1 } }
      );
      if (!call || !call.active) {
        send(ws, JSON.stringify({ type: "ended" }));
        try { ws.close(1000, "call not live"); } catch {}
      }
    }
  } catch { /* keep the listener; the bridge ends it when the call stops */ }
}

module.exports = {
  CHANNEL_LEAD,
  CHANNEL_AGENT,
  handleListener,
  broadcastAudio,
  broadcastControl,
  endListeners,
};

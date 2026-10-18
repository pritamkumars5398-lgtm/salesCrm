import crypto from "crypto";

/** Must match listenSecret() in src/server/live-listen.js. */
function listenSecret(): string {
  return process.env.LISTEN_TOKEN_SECRET
    || crypto.createHash("sha256").update(`call-listen:${process.env.MONGODB_URI || ""}`).digest("hex");
}

/** Short-lived token that lets a browser subscribe to one live call's audio. */
export function signListenToken(callId: string, ttlMs = 2 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac("sha256", listenSecret()).update(`${callId}.${exp}`).digest("hex");
  return `${callId}.${exp}.${sig}`;
}

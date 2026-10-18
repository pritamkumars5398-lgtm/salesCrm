/**
 * Signed session cookie. Uses Web Crypto only, so the same code verifies the
 * cookie in middleware (Edge runtime) and in route handlers (Node).
 *
 * Token: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload)).
 */

export const SESSION_COOKIE = "sa_session";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export interface SessionPayload {
  uid: string;
  email: string;
  /** must match User.sessionVersion — bumping it signs the user out everywhere */
  sv: number;
  exp: number;
}

const DEV_FALLBACK_SECRET = "dev-only-insecure-session-secret-change-me";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set (32+ characters) in production.");
  }
  return DEV_FALLBACK_SECRET;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.importKey(
      "raw", encoder.encode(getSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
    );
  }
  return keyPromise;
}

export async function signSession(input: Omit<SessionPayload, "exp">): Promise<string> {
  const payload: SessionPayload = { ...input, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await getKey(), encoder.encode(body)));
  return `${body}.${toBase64Url(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC", await getKey(), fromBase64Url(token.slice(dot + 1)), encoder.encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Read a cookie value from a raw Cookie header. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

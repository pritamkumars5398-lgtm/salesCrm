import crypto from "crypto";

const KEY_LEN = 64;
const PREFIX = "scrypt$";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${PREFIX}${salt}$${hash}`;
}

/**
 * Accounts created before salted hashing store a bare SHA-256 hex digest.
 * `needsRehash` tells the caller to upgrade the stored hash after a successful login.
 */
export function verifyPassword(password: string, stored: string): { ok: boolean; needsRehash: boolean } {
  if (stored.startsWith(PREFIX)) {
    const [salt, hash] = stored.slice(PREFIX.length).split("$");
    if (!salt || !hash) return { ok: false, needsRehash: false };
    const expected = Buffer.from(hash, "hex");
    const actual = crypto.scryptSync(password, salt, expected.length);
    return { ok: actual.length === expected.length && crypto.timingSafeEqual(actual, expected), needsRehash: false };
  }
  const legacy = Buffer.from(crypto.createHash("sha256").update(password).digest("hex"));
  const storedBuf = Buffer.from(stored);
  const ok = legacy.length === storedBuf.length && crypto.timingSafeEqual(legacy, storedBuf);
  return { ok, needsRehash: ok };
}

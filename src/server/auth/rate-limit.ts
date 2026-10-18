/**
 * In-memory attempt limiter for login/signup. Per process only — good enough to
 * stop casual password guessing; put a shared store in front for multi-instance deploys.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

declare global {
  var _authAttempts: Map<string, { count: number; resetAt: number }> | undefined;
}
const attempts = global._authAttempts ?? new Map<string, { count: number; resetAt: number }>();
global._authAttempts = attempts;

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns seconds to wait when the key is over the limit, otherwise null (and counts the attempt). */
export function hitRateLimit(key: string): number | null {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  if (entry.count >= MAX_ATTEMPTS) return Math.ceil((entry.resetAt - now) / 1000);
  entry.count++;
  return null;
}

export function clearRateLimit(key: string) {
  attempts.delete(key);
}

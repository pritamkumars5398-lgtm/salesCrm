import { Agent } from "@/lib/models/Agent";
import { Organization } from "@/lib/models/Organization";

const CACHE_MS = 60_000;

declare global {
  var _platformCredCache: Map<string, { allowed: boolean; at: number }> | undefined;
}
const cache = global._platformCredCache ?? new Map<string, { allowed: boolean; at: number }>();
global._platformCredCache = cache;

/** Whether this workspace may use the platform's .env credentials as defaults. */
export async function canUsePlatformCredentials(agentId: string): Promise<boolean> {
  if (process.env.ALLOW_ENV_CREDENTIALS_FOR_ALL === "true") return true;
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.allowed;

  let allowed = false;
  const agent = await Agent.findById(agentId).select("organizationId").lean();
  if (agent && !agent.organizationId) {
    allowed = true; // not migrated yet — behaves exactly as before
  } else if (agent?.organizationId) {
    const org = await Organization.findById(agent.organizationId).select("usesPlatformCredentials").lean();
    allowed = !!org?.usesPlatformCredentials;
  }
  cache.set(agentId, { allowed, at: Date.now() });
  return allowed;
}

/**
 * `env("SMTP_PASS")` returns the platform value only for workspaces allowed to
 * use it, otherwise "". Use for every credential/identity fallback.
 */
export async function platformEnv(agentId: string): Promise<(name: string) => string> {
  const allowed = await canUsePlatformCredentials(agentId);
  return (name: string) => (allowed ? process.env[name] || "" : "");
}

export function clearPlatformCredentialCache() {
  cache.clear();
}

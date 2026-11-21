import { Agent } from "@/lib/models/Agent";
import { Organization } from "@/lib/models/Organization";
import { Usage } from "@/lib/models/Usage";
import { currentMonth } from "@/lib/utils/date";
import { getOrganizationLimits, getOrganizationUsage } from "./workspace.service";

/**
 * The AI Assistant's monthly token allowance: the plan's limit for the whole
 * organization, plus bought top-up tokens (used only after the plan's run out).
 */
export interface AssistantAllowance {
  used: number;
  /** -1 = unlimited, 0 = switched off */
  limit: number;
  /** extra top-up tokens left */
  credits: number;
  /** tokens still usable now (Infinity when unlimited) */
  left: number;
}

async function orgOf(agentId: string): Promise<string | null> {
  const a = await Agent.findById(agentId).select("organizationId").lean();
  return a?.organizationId ? String(a.organizationId) : null;
}

export async function getAssistantAllowance(agentId: string): Promise<AssistantAllowance> {
  const orgId = await orgOf(agentId);
  // Workspaces from before organizations existed: no assistant limit.
  if (!orgId) return { used: 0, limit: -1, credits: 0, left: Infinity };
  const [{ limits }, usage, org] = await Promise.all([
    getOrganizationLimits(orgId),
    getOrganizationUsage(orgId),
    Organization.findById(orgId).select("topUpCredits").lean(),
  ]);
  const limit = limits.assistantTokensPerMonth ?? -1;
  const used = usage.assistantTokens ?? 0;
  const credits = org?.topUpCredits?.assistantTokens ?? 0;
  if (limit === -1) return { used, limit, credits, left: Infinity };
  if (limit === 0) return { used, limit, credits, left: 0 };
  return { used, limit, credits, left: Math.max(0, limit - used) + credits };
}

/** Count tokens a chat turn used; anything past the plan's limit comes out of top-up tokens. */
export async function recordAssistantTokens(agentId: string, tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const before = await getAssistantAllowance(agentId);
  await Usage.updateOne({ agentId, month: currentMonth() }, { $inc: { assistantTokens: Math.round(tokens) } }, { upsert: true });
  if (before.limit <= 0) return;
  const overBefore = Math.max(0, before.used - before.limit);
  const overAfter = Math.max(0, before.used + tokens - before.limit);
  const fromCredits = Math.min(before.credits, Math.round(overAfter - overBefore));
  if (fromCredits > 0) {
    const orgId = await orgOf(agentId);
    if (orgId) await Organization.updateOne({ _id: orgId }, { $inc: { "topUpCredits.assistantTokens": -fromCredits } });
  }
}

/** For the chat panel: "x tokens left" (null left = unlimited). */
export function allowanceForClient(a: AssistantAllowance) {
  return { used: a.used, limit: a.limit, credits: a.credits, left: Number.isFinite(a.left) ? a.left : null };
}

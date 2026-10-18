import { Usage } from "@/lib/models/Usage";
import { Setting } from "@/lib/models/Setting";
import { Agent } from "@/lib/models/Agent";
import { PLANS, type PlanId, type PlanLimits } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";
import { getOrganizationLimits, getOrganizationUsage, UsageField } from "@/server/services/workspace.service";

const LIMIT_KEY: Record<UsageField, keyof PlanLimits> = {
  leadsScraped: "leadsPerMonth",
  messagesSent: "messagesPerMonth",
  emailsSent: "emailsPerMonth",
  smsSent: "smsPerMonth",
  callsMade: "callsPerMonth",
};

/**
 * The plan belongs to the organization and usage is summed over all its
 * workspaces — otherwise every new workspace would come with a fresh quota.
 * Workspaces not yet migrated into an organization fall back to their own plan.
 */
export async function checkUsageLimit(
  agentId: string,
  field: UsageField,
  incrementAmount: number = 1
): Promise<boolean> {
  const agent = await Agent.findById(agentId).select("organizationId").lean();

  if (agent?.organizationId) {
    const orgId = String(agent.organizationId);
    const [{ limits }, usage] = await Promise.all([getOrganizationLimits(orgId), getOrganizationUsage(orgId)]);
    const max = limits[LIMIT_KEY[field]];
    return max === -1 || usage[field] + incrementAmount <= max;
  }

  const month = currentMonth();
  const [usage, planRow, customLimitsRow] = await Promise.all([
    Usage.findOne({ agentId, month }).lean(),
    Setting.findOne({ agentId, key: "plan" }).lean(),
    Setting.findOne({ agentId, key: "custom_limits" }).lean(),
  ]);

  const planId = (planRow?.value ?? "free") as PlanId;
  let limits = { ...(PLANS[planId] ?? PLANS.free).limits };
  if (customLimitsRow?.value) {
    try {
      limits = { ...limits, ...JSON.parse(customLimitsRow.value) };
    } catch (e) {
      console.error("Failed to parse custom limits", e);
    }
  }

  const max = limits[LIMIT_KEY[field]];
  if (max === -1) return true;
  return (usage?.[field] ?? 0) + incrementAmount <= max;
}

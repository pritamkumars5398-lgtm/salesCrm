import { Usage } from "@/lib/models/Usage";
import { Setting } from "@/lib/models/Setting";
import { Agent } from "@/lib/models/Agent";
import { Organization } from "@/lib/models/Organization";
import { PLANS, type PlanId, type PlanLimits } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";
import { getOrganizationLimits, getOrganizationUsage, UsageField } from "@/server/services/workspace.service";

const LIMIT_KEY: Record<UsageField, keyof PlanLimits> = {
  leadsScraped: "leadsPerMonth",
  messagesSent: "messagesPerMonth",
  emailsSent: "emailsPerMonth",
  smsSent: "smsPerMonth",
  callsMade: "callsPerMonth",
  assistantTokens: "assistantTokensPerMonth",
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
    if (max === 0) return false; // switched off for this client by the platform admin
    if (max === -1 || usage[field] + incrementAmount <= max) return true;
    // Over the monthly plan limit: use bought top-up credits, if there are enough (atomic, so
    // two sends at once can't spend the same credit).
    const paid = await Organization.findOneAndUpdate(
      { _id: orgId, [`topUpCredits.${field}`]: { $gte: incrementAmount } },
      { $inc: { [`topUpCredits.${field}`]: -incrementAmount } },
      { new: true },
    ).select("_id").lean();
    return !!paid;
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

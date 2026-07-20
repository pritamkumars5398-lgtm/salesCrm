import { Usage } from "@/lib/models/Usage";
import { Setting } from "@/lib/models/Setting";
import { PLANS, type PlanId } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";

export async function checkUsageLimit(
  agentId: string,
  field: "leadsScraped" | "messagesSent" | "emailsSent" | "smsSent",
  incrementAmount: number = 1
): Promise<boolean> {
  const month = currentMonth();
  const [usage, planRow, customLimitsRow] = await Promise.all([
    Usage.findOne({ agentId, month }).lean(),
    Setting.findOne({ agentId, key: "plan" }).lean(),
    Setting.findOne({ agentId, key: "custom_limits" }).lean(),
  ]);

  const planId = (planRow?.value ?? "free") as PlanId;
  const plan = PLANS[planId];
  let limits = { ...plan.limits };

  if (customLimitsRow?.value) {
    try {
      limits = { ...limits, ...JSON.parse(customLimitsRow.value) };
    } catch (e) {
      console.error("Failed to parse custom limits", e);
    }
  }

  let maxVal: number;
  if (field === "leadsScraped") maxVal = limits.leadsPerMonth;
  else if (field === "messagesSent") maxVal = limits.messagesPerMonth;
  else if (field === "emailsSent") maxVal = limits.emailsPerMonth;
  else if (field === "smsSent") maxVal = limits.smsPerMonth;
  else maxVal = -1; // Fallback or unhandled

  if (maxVal === -1) return true; // Unlimited

  const currentVal = usage?.[field] ?? 0;
  return (currentVal + incrementAmount) <= maxVal;
}

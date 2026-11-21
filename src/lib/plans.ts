export type PlanId = "free" | "starter" | "growth" | "pro";

export interface PlanLimits {
  leadsPerMonth: number;    // -1 = unlimited
  messagesPerMonth: number;
  callsPerMonth: number;
  emailsPerMonth: number;
  smsPerMonth: number;
  /** AI Assistant (chat panel) tokens per month; -1 = unlimited */
  assistantTokensPerMonth: number;
  /** business lines (workspaces) one organization may run */
  workspaces: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  priceINR: number;
  color: string;
  badge?: string;
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceINR: 0,
    color: "#64748b",
    limits: {
      leadsPerMonth: 25,
      messagesPerMonth: 50,
      callsPerMonth: 5,
      emailsPerMonth: 100,
      smsPerMonth: 20,
      workspaces: 2,
      assistantTokensPerMonth: 50000,
    },
    features: [
      "50,000 AI assistant tokens / month",
      "2 business workspaces",
      "25 leads / month",
      "50 WhatsApp messages / month",
      "SMS — coming soon",
      "5 AI calls / month",
      "100 emails / month",
      "BYOK (bring your own API keys)",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceINR: 999,
    color: "#df2a2a",
    limits: {
      leadsPerMonth: 200,
      messagesPerMonth: 500,
      callsPerMonth: 30,
      emailsPerMonth: -1,
      smsPerMonth: 200,
      workspaces: 3,
      assistantTokensPerMonth: 300000,
    },
    features: [
      "3 lakh AI assistant tokens / month",
      "3 business workspaces",
      "200 leads / month",
      "500 WhatsApp messages / month",
      "SMS — coming soon",
      "30 AI calls / month",
      "Unlimited emails",
      "CRM pipeline",
      "Email sequences",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceINR: 2499,
    color: "#8b5cf6",
    badge: "Most Popular",
    limits: {
      leadsPerMonth: 1000,
      messagesPerMonth: 2000,
      callsPerMonth: 100,
      emailsPerMonth: -1,
      smsPerMonth: 1000,
      workspaces: 5,
      assistantTokensPerMonth: 1000000,
    },
    features: [
      "10 lakh AI assistant tokens / month",
      "5 business workspaces",
      "1,000 leads / month",
      "2,000 WhatsApp messages / month",
      "SMS — coming soon",
      "100 AI calls / month",
      "Unlimited emails",
      "Priority support",
      "CSV export",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceINR: 4999,
    color: "#f59e0b",
    limits: {
      leadsPerMonth: 5000,
      messagesPerMonth: -1,
      callsPerMonth: 500,
      emailsPerMonth: -1,
      smsPerMonth: 3000,
      workspaces: -1,
      assistantTokensPerMonth: -1,
    },
    features: [
      "Unlimited AI assistant",
      "Unlimited business workspaces",
      "5,000 leads / month",
      "Unlimited WhatsApp messages",
      "SMS — coming soon",
      "500 AI calls / month",
      "Unlimited emails",
      "API access",
      "Webhook integrations",
      "White-label option",
    ],
  },
};

export function getPlanLimit(plan: PlanId, key: keyof PlanLimits): number {
  return PLANS[plan].limits[key];
}

export function isUnlimited(plan: PlanId, key: keyof PlanLimits): boolean {
  return PLANS[plan].limits[key] === -1;
}

export function usagePercent(used: number, plan: PlanId, key: keyof PlanLimits): number {
  const limit = PLANS[plan].limits[key];
  if (limit === -1) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

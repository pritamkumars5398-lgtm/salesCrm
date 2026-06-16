export type PlanId = "free" | "starter" | "growth" | "pro";

export interface PlanLimits {
  leadsPerMonth: number;    // -1 = unlimited
  messagesPerMonth: number;
  callsPerMonth: number;
  emailsPerMonth: number;
  agents: number;
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
      agents: 1,
    },
    features: [
      "25 leads scraped / month",
      "50 WhatsApp messages / month",
      "5 AI calls / month",
      "100 emails / month",
      "1 agent",
      "BYOK (bring your own API keys)",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceINR: 999,
    color: "#6366f1",
    limits: {
      leadsPerMonth: 200,
      messagesPerMonth: 500,
      callsPerMonth: 30,
      emailsPerMonth: -1,
      agents: 1,
    },
    features: [
      "200 leads scraped / month",
      "500 WhatsApp messages / month",
      "30 AI calls / month",
      "Unlimited emails",
      "1 agent",
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
      agents: 3,
    },
    features: [
      "1,000 leads scraped / month",
      "2,000 WhatsApp messages / month",
      "100 AI calls / month",
      "Unlimited emails",
      "3 agents",
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
      agents: 10,
    },
    features: [
      "5,000 leads scraped / month",
      "Unlimited WhatsApp messages",
      "500 AI calls / month",
      "Unlimited emails",
      "10 agents",
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

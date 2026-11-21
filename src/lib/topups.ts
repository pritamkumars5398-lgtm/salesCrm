import { SMS_COMING_SOON } from "@/lib/constants/coming-soon";
/**
 * Top-up packs: extra units of one feature, bought on top of the monthly plan.
 * Credits never expire and are only used once the plan's monthly limit runs out.
 * Change the packs or prices here.
 */
export type TopUpField = "callsMade" | "messagesSent" | "smsSent" | "emailsSent" | "leadsScraped" | "assistantTokens";

export interface TopUpPack {
  id: string;
  field: TopUpField;
  units: number;
  priceINR: number;
}

const ALL_TOPUP_PACKS: TopUpPack[] = [
  { id: "calls-25", field: "callsMade", units: 25, priceINR: 499 },
  { id: "calls-100", field: "callsMade", units: 100, priceINR: 1799 },
  { id: "whatsapp-500", field: "messagesSent", units: 500, priceINR: 299 },
  { id: "sms-200", field: "smsSent", units: 200, priceINR: 199 },
  { id: "emails-1000", field: "emailsSent", units: 1000, priceINR: 99 },
  { id: "leads-200", field: "leadsScraped", units: 200, priceINR: 399 },
  { id: "assistant-500k", field: "assistantTokens", units: 500000, priceINR: 299 },
];

/** Packs on sale now (SMS packs are hidden while SMS is coming soon). */
export const TOPUP_PACKS: TopUpPack[] = ALL_TOPUP_PACKS.filter((p) => !(SMS_COMING_SOON && p.field === "smsSent"));

/** Plain names for each feature, as customers see them. */
export const FEATURE_LABEL: Record<TopUpField, { name: string; unit: string }> = {
  callsMade: { name: "AI calls", unit: "calls" },
  messagesSent: { name: "WhatsApp messages", unit: "messages" },
  smsSent: { name: "SMS", unit: "SMS" },
  emailsSent: { name: "Emails", unit: "emails" },
  leadsScraped: { name: "New leads", unit: "leads" },
  assistantTokens: { name: "AI assistant", unit: "tokens" },
};

export const TOPUP_FIELDS = Object.keys(FEATURE_LABEL) as TopUpField[];

export function findPack(id: string): TopUpPack | undefined {
  return TOPUP_PACKS.find((p) => p.id === id);
}

export type TopUpCredits = Record<TopUpField, number>;

export function emptyCredits(): TopUpCredits {
  return { callsMade: 0, messagesSent: 0, smsSent: 0, emailsSent: 0, leadsScraped: 0, assistantTokens: 0 };
}

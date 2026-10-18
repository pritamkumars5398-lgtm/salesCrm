import { Types } from "mongoose";
import { Agent } from "@/lib/models/Agent";
import { Lead } from "@/lib/models/Lead";
import { LeadFieldDef, coerceFieldValue, formatFieldValue } from "@/lib/lead-fields";
import { getSettingsMap } from "./settings.service";
import { getFieldDefs, groupsForLead } from "./lead-groups.service";

/**
 * A workspace's "AI sales playbook": who we are, what we sell, to whom and
 * what a successful conversation ends with. Every AI prompt (emails,
 * WhatsApp, replies, follow-ups, calls) is built from this, so each business
 * line is pitched with its own offer and never another workspace's.
 */
export const PLAYBOOK_KEYS = [
  "brandName", "aiPersonaName", "offerType", "offerSummary", "targetCustomer", "businessServices",
  "pricingInfo", "callGoal", "objectionHandling", "businessWebsite", "businessPhone", "docLink",
  "customPrompt", "calendlyLink",
] as const;

export type Playbook = Record<(typeof PLAYBOOK_KEYS)[number], string>;

export async function getPlaybook(agentId: string): Promise<Playbook> {
  const [m, agent] = await Promise.all([
    getSettingsMap(agentId, [...PLAYBOOK_KEYS]),
    Agent.findById(agentId).select("name").lean(),
  ]);
  const p = Object.fromEntries(PLAYBOOK_KEYS.map((k) => [k, (m[k] || "").trim()])) as Playbook;
  if (!p.brandName) p.brandName = agent?.name || "our company";
  return p;
}

/** True when the AI has been told what this workspace sells. */
export function hasOffer(p: Playbook): boolean {
  return !!(p.offerSummary || p.businessServices);
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/** The "WHO WE ARE" block shared by all prompts. */
export function businessBrief(p: Playbook, opts: { detailChars?: number } = {}): string {
  const lines: string[] = [];
  lines.push(`- Company: ${p.brandName}${p.offerType ? ` (we sell: ${p.offerType.toLowerCase()})` : ""}`);
  if (p.offerSummary) lines.push(`- What we offer: ${p.offerSummary}`);
  if (p.targetCustomer) lines.push(`- Who we sell to: ${p.targetCustomer}`);
  if (p.businessServices) lines.push(`- Details (products / services / features): ${clip(p.businessServices.replace(/\s*\n\s*/g, "; "), opts.detailChars ?? 1500)}`);
  lines.push(p.pricingInfo
    ? `- Pricing we may share: ${clip(p.pricingInfo.replace(/\s*\n\s*/g, "; "), 600)}`
    : "- Pricing: not provided — never quote a price; offer to have the team share it.");
  lines.push(`- Goal of every conversation: ${p.callGoal || "set up a short call with our team"}`);
  if (p.objectionHandling) lines.push(`- Common objections and how to answer them: ${clip(p.objectionHandling.replace(/\s*\n\s*/g, "; "), 800)}`);
  if (p.businessWebsite) lines.push(`- Our website: ${p.businessWebsite}`);
  if (p.businessPhone) lines.push(`- Our phone: ${p.businessPhone}`);
  if (p.docLink) lines.push(`- Brochure / details link (share when they ask for details): ${p.docLink}`);
  lines.push(`- Only talk about what ${p.brandName} offers above. Never offer a product or service that is not listed, and never mention other businesses we may run.`);
  if (p.customPrompt) lines.push(`- Extra rules you must follow: ${clip(p.customPrompt, 1500)}`);
  return lines.join("\n");
}

export interface LeadAiContext {
  /** custom field values + tags, as bullet lines */
  facts: string;
  /** guidance from the groups this lead is in */
  groupGuidance: string;
  groupNames: string[];
}

export async function leadAiContext(
  agentId: string,
  lead: { _id: Types.ObjectId | string; customFields?: Record<string, unknown>; tags?: string[] },
): Promise<LeadAiContext> {
  const [defs, groups] = await Promise.all([getFieldDefs(agentId), groupsForLead(agentId, lead._id)]);
  const values = lead.customFields ?? {};
  const facts: string[] = [];
  for (const def of defs) {
    const shown = formatFieldValue(def, values[def.key]);
    if (shown) facts.push(`- ${def.label}: ${shown}`);
  }
  if (lead.tags?.length) facts.push(`- Tags: ${lead.tags.join(", ")}`);
  const guidance = groups
    .filter((g) => g.playbook?.trim())
    .map((g) => `- ${g.name}: ${clip(g.playbook.trim(), 500)}`);
  return { facts: facts.join("\n"), groupGuidance: guidance.join("\n"), groupNames: groups.map((g) => g.name) };
}

/** Prompt section asking the model to extract values for the AI-fillable fields. */
export function aiFillInstructions(defs: LeadFieldDef[]): string {
  const fillable = defs.filter((d) => d.aiFill);
  if (fillable.length === 0) return "";
  const lines = fillable.map((d) => {
    const kind = d.type === "select" ? `one of: ${d.options.join(" | ")}`
      : d.type === "multiselect" ? `a list from: ${d.options.join(" | ")}`
        : d.type === "boolean" ? "true or false"
          : d.type === "number" ? "a number"
            : d.type === "date" ? "a date YYYY-MM-DD"
              : "short text";
    return `  - "${d.key}" (${d.label}${d.description ? ` — ${d.description}` : ""}): ${kind}`;
  });
  return `Fields to fill ONLY from what the lead clearly said (omit a field when unsure — never guess):\n${lines.join("\n")}`;
}

/**
 * Save AI-extracted field values on a lead. Only AI-fillable fields, only
 * valid values, never clears a value; each change is written to the lead's
 * history (by "AI") so it can be seen and corrected.
 */
export async function applyAiFieldValues(
  agentId: string,
  leadId: Types.ObjectId | string,
  extracted: unknown,
  source: string,
): Promise<number> {
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return 0;
  const defs = (await getFieldDefs(agentId)).filter((d) => d.aiFill);
  if (defs.length === 0) return 0;
  const lead = await Lead.findById(leadId).select("customFields").lean();
  if (!lead) return 0;
  const current = (lead.customFields ?? {}) as Record<string, unknown>;

  const set: Record<string, unknown> = {};
  const history: { field: string; from: string; to: string; by: string; at: Date; note: string }[] = [];
  for (const def of defs) {
    const raw = (extracted as Record<string, unknown>)[def.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const { value, error } = coerceFieldValue(def, raw);
    if (error || value === undefined) continue;
    if (JSON.stringify(value) === JSON.stringify(current[def.key])) continue;
    set[`customFields.${def.key}`] = value;
    history.push({
      field: def.label,
      from: formatFieldValue(def, current[def.key]) || "—",
      to: formatFieldValue(def, value),
      by: "AI",
      at: new Date(),
      note: `Picked up from ${source}`,
    });
  }
  if (history.length === 0) return 0;
  await Lead.updateOne({ _id: leadId }, { $set: set, $push: { history: { $each: history } } });
  return history.length;
}

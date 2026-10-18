/**
 * Custom lead fields and smart-group rules — shared by the API (validation,
 * Mongo filters) and the UI (editors), so both sides agree on what is valid.
 */

export type LeadFieldType = "text" | "number" | "select" | "multiselect" | "boolean" | "date";

export interface LeadFieldDef {
  _id?: string;
  key: string;
  label: string;
  type: LeadFieldType;
  options: string[];
  /** let the AI fill this from calls and replies */
  aiFill: boolean;
  /** tells the AI what the field means / how to judge it */
  description?: string;
  order?: number;
}

export type RuleOp =
  | "equals" | "not_equals" | "contains" | "not_contains" | "is_empty" | "is_not_empty"
  | "gt" | "gte" | "lt" | "lte"
  | "is_true" | "is_false"
  | "before" | "after" | "in_last_days" | "older_than_days";

export interface GroupRule {
  /** "cf.<key>" for a custom field, otherwise a built-in lead field */
  field: string;
  op: RuleOp;
  value?: string | number;
}

export const LEAD_FIELD_TYPES: { value: LeadFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "multiselect", label: "Multi-select" },
  { value: "boolean", label: "Yes / No" },
  { value: "date", label: "Date" },
];

export const MAX_FIELDS_PER_WORKSPACE = 40;
export const MAX_GROUPS_PER_WORKSPACE = 50;
export const MAX_RULES_PER_GROUP = 10;
export const MAX_TAGS_PER_LEAD = 30;

/** Built-in lead fields a smart group can filter on. */
export const BUILTIN_RULE_FIELDS: { key: string; label: string; type: LeadFieldType | "tags"; options?: string[] }[] = [
  { key: "status", label: "Status", type: "select", options: ["new", "in_outreach", "replied", "meeting_booked", "closed"] },
  { key: "pipelineStage", label: "Pipeline stage", type: "select", options: ["new", "contacted", "replied", "qualified", "closed"] },
  { key: "source", label: "Source", type: "select", options: ["LinkedIn", "Google Maps", "JustDial", "Manual", "Apify", "Referral", "LLM"] },
  { key: "outreachStatus", label: "Outreach status", type: "select", options: ["none", "pending", "sending", "sent", "failed"] },
  { key: "jobTitle", label: "Business type / job title", type: "text" },
  { key: "company", label: "Company", type: "text" },
  { key: "location", label: "Location", type: "text" },
  { key: "website", label: "Website", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "tags", label: "Tags", type: "tags" },
  { key: "createdAt", label: "Added on", type: "date" },
  { key: "lastContactedAt", label: "Last contacted", type: "date" },
];

export const OPS_BY_TYPE: Record<LeadFieldType | "tags", { op: RuleOp; label: string; needsValue: boolean }[]> = {
  text: [
    { op: "equals", label: "is", needsValue: true },
    { op: "not_equals", label: "is not", needsValue: true },
    { op: "contains", label: "contains", needsValue: true },
    { op: "not_contains", label: "does not contain", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
    { op: "is_not_empty", label: "is not empty", needsValue: false },
  ],
  number: [
    { op: "equals", label: "=", needsValue: true },
    { op: "not_equals", label: "≠", needsValue: true },
    { op: "gt", label: ">", needsValue: true },
    { op: "gte", label: "≥", needsValue: true },
    { op: "lt", label: "<", needsValue: true },
    { op: "lte", label: "≤", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
    { op: "is_not_empty", label: "is not empty", needsValue: false },
  ],
  select: [
    { op: "equals", label: "is", needsValue: true },
    { op: "not_equals", label: "is not", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
    { op: "is_not_empty", label: "is not empty", needsValue: false },
  ],
  multiselect: [
    { op: "contains", label: "includes", needsValue: true },
    { op: "not_contains", label: "does not include", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
    { op: "is_not_empty", label: "is not empty", needsValue: false },
  ],
  boolean: [
    { op: "is_true", label: "is yes", needsValue: false },
    { op: "is_false", label: "is no / empty", needsValue: false },
  ],
  date: [
    { op: "in_last_days", label: "in the last N days", needsValue: true },
    { op: "older_than_days", label: "more than N days ago", needsValue: true },
    { op: "before", label: "before", needsValue: true },
    { op: "after", label: "after", needsValue: true },
    { op: "is_empty", label: "is empty", needsValue: false },
    { op: "is_not_empty", label: "is not empty", needsValue: false },
  ],
  tags: [
    { op: "contains", label: "has tag", needsValue: true },
    { op: "not_contains", label: "doesn't have tag", needsValue: true },
    { op: "is_empty", label: "has no tags", needsValue: false },
    { op: "is_not_empty", label: "has any tag", needsValue: false },
  ],
};

/** "Service interested in" → "service_interested_in". Empty when nothing usable is left. */
export function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_]/g, "").slice(0, 40);
}

/** Field type + options for a rule's field, or null when the field no longer exists. */
export function ruleFieldInfo(
  field: string,
  defs: LeadFieldDef[],
): { type: LeadFieldType | "tags"; options?: string[]; label: string } | null {
  if (field.startsWith("cf.")) {
    const def = defs.find((d) => d.key === field.slice(3));
    return def ? { type: def.type, options: def.options, label: def.label } : null;
  }
  const builtin = BUILTIN_RULE_FIELDS.find((b) => b.key === field);
  return builtin ? { type: builtin.type, options: builtin.options, label: builtin.label } : null;
}

/** Why a rule can't be used, or null when it is valid. */
export function validateRule(rule: GroupRule, defs: LeadFieldDef[]): string | null {
  const info = ruleFieldInfo(rule.field, defs);
  if (!info) return `The field "${rule.field.replace(/^cf\./, "")}" no longer exists.`;
  const op = OPS_BY_TYPE[info.type].find((o) => o.op === rule.op);
  if (!op) return `"${rule.op}" can't be used with ${info.label}.`;
  if (!op.needsValue) return null;
  const value = rule.value;
  if (value === undefined || value === null || String(value).trim() === "") return `Enter a value for ${info.label}.`;
  if (info.type === "number" && !Number.isFinite(Number(value))) return `${info.label} needs a number.`;
  if (info.type === "date") {
    if (rule.op === "in_last_days" || rule.op === "older_than_days") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 3650) return `${info.label} needs a number of days (0–3650).`;
    } else if (isNaN(new Date(String(value)).getTime())) {
      return `${info.label} needs a valid date.`;
    }
  }
  return null;
}

/**
 * Coerce a submitted custom-field value to its stored form. Returns
 * `{ value: undefined }` to clear the field, or an error for invalid input.
 */
export function coerceFieldValue(def: LeadFieldDef, raw: unknown): { value?: unknown; error?: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { value: undefined };
  switch (def.type) {
    case "text": {
      return { value: String(raw).trim().slice(0, 500) };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,₹$\s]/g, ""));
      return Number.isFinite(n) ? { value: n } : { error: `${def.label} must be a number.` };
    }
    case "select": {
      const match = def.options.find((o) => o.toLowerCase() === String(raw).trim().toLowerCase());
      return match ? { value: match } : { error: `${def.label} must be one of: ${def.options.join(", ")}.` };
    }
    case "multiselect": {
      const list = Array.isArray(raw) ? raw : String(raw).split(",");
      const picked: string[] = [];
      for (const item of list) {
        const match = def.options.find((o) => o.toLowerCase() === String(item).trim().toLowerCase());
        if (!match) return { error: `"${String(item).trim()}" is not an option for ${def.label}.` };
        if (!picked.includes(match)) picked.push(match);
      }
      return { value: picked.length ? picked : undefined };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      const s = String(raw).trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(s)) return { value: true };
      if (["false", "no", "n", "0"].includes(s)) return { value: false };
      return { error: `${def.label} must be yes or no.` };
    }
    case "date": {
      const d = new Date(String(raw));
      return isNaN(d.getTime()) ? { error: `${def.label} must be a date.` } : { value: d.toISOString().slice(0, 10) };
    }
  }
}

export function cleanOptions(type: LeadFieldType, raw: unknown): { options?: string[]; error?: string } {
  if (type !== "select" && type !== "multiselect") return { options: [] };
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const options = [...new Set(list.map((o) => String(o).trim().slice(0, 60)).filter(Boolean))];
  if (options.length === 0) return { error: "Add at least one option for a dropdown field." };
  if (options.length > 50) return { error: "A dropdown can have at most 50 options." };
  return { options };
}

export function formatFieldValue(def: LeadFieldDef, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (def.type === "boolean") return value ? "Yes" : "No";
  if (def.type === "multiselect" && Array.isArray(value)) return value.join(", ");
  if (def.type === "number" && typeof value === "number") return value.toLocaleString("en-IN");
  return String(value);
}

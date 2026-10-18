import { Types } from "mongoose";
import { Lead } from "@/lib/models/Lead";
import { LeadField } from "@/lib/models/LeadField";
import { LeadGroup, ILeadGroup } from "@/lib/models/LeadGroup";
import { GroupRule, LeadFieldDef, ruleFieldInfo, validateRule, normalizeTag } from "@/lib/lead-fields";

type Filter = Record<string, unknown>;

/** Matches no document — used when a smart group has no usable rule. */
export const MATCH_NOTHING: Filter = { _id: { $exists: false } };

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EMPTY_VALUES = [null, ""];

function ruleToFilter(rule: GroupRule, defs: LeadFieldDef[]): Filter | null {
  if (validateRule(rule, defs)) return null;
  const info = ruleFieldInfo(rule.field, defs)!;
  const path = rule.field.startsWith("cf.") ? `customFields.${rule.field.slice(3)}` : rule.field;
  const raw = rule.value;
  const str = raw === undefined ? "" : String(raw).trim();

  if (rule.op === "is_empty") {
    if (info.type === "multiselect" || info.type === "tags") return { $or: [{ [path]: { $exists: false } }, { [path]: { $size: 0 } }] };
    return { $or: [{ [path]: { $exists: false } }, { [path]: { $in: EMPTY_VALUES } }] };
  }
  if (rule.op === "is_not_empty") {
    if (info.type === "multiselect" || info.type === "tags") return { [`${path}.0`]: { $exists: true } };
    return { [path]: { $exists: true, $nin: EMPTY_VALUES } };
  }

  switch (info.type) {
    case "tags": {
      const tag = normalizeTag(str);
      return rule.op === "contains" ? { [path]: tag } : { [path]: { $ne: tag } };
    }
    case "multiselect": {
      const re = new RegExp(`^${escapeRegex(str)}$`, "i");
      return rule.op === "contains" ? { [path]: re } : { [path]: { $not: re } };
    }
    case "boolean":
      return rule.op === "is_true" ? { [path]: true } : { [path]: { $ne: true } };
    case "number": {
      const n = Number(raw);
      const map: Record<string, string> = { equals: "$eq", not_equals: "$ne", gt: "$gt", gte: "$gte", lt: "$lt", lte: "$lte" };
      return map[rule.op] ? { [path]: { [map[rule.op]]: n } } : null;
    }
    case "date": {
      // Custom date fields are stored as YYYY-MM-DD strings, built-ins as Dates.
      const asString = rule.field.startsWith("cf.");
      const toCmp = (d: Date) => (asString ? d.toISOString().slice(0, 10) : d);
      if (rule.op === "in_last_days" || rule.op === "older_than_days") {
        const cutoff = new Date(Date.now() - Number(raw) * 24 * 60 * 60 * 1000);
        return rule.op === "in_last_days" ? { [path]: { $gte: toCmp(cutoff) } } : { [path]: { $lt: toCmp(cutoff) } };
      }
      const d = new Date(str);
      return rule.op === "before" ? { [path]: { $lt: toCmp(d) } } : { [path]: { $gt: toCmp(d) } };
    }
    default: {
      // text / select: case-insensitive
      if (rule.op === "equals") return { [path]: new RegExp(`^${escapeRegex(str)}$`, "i") };
      if (rule.op === "not_equals") return { [path]: { $not: new RegExp(`^${escapeRegex(str)}$`, "i") } };
      if (rule.op === "contains") return { [path]: new RegExp(escapeRegex(str), "i") };
      if (rule.op === "not_contains") return { [path]: { $not: new RegExp(escapeRegex(str), "i") } };
      return null;
    }
  }
}

/**
 * Mongo filter selecting a group's leads (without the agentId/deletedAt scope).
 * A smart group whose rules are all invalid (e.g. its field was deleted)
 * matches NOTHING — never everything, which could blast a campaign at every lead.
 */
export function groupFilter(group: Pick<ILeadGroup, "_id" | "kind" | "match" | "rules">, defs: LeadFieldDef[]): Filter {
  if (group.kind === "manual") return { groupIds: new Types.ObjectId(String(group._id)) };
  const parts = (group.rules || []).map((r) => ruleToFilter(r, defs)).filter((f): f is Filter => !!f);
  if (parts.length === 0) return MATCH_NOTHING;
  // With "all", a broken rule must not widen the group: drop to nothing instead.
  if (group.match === "all" && parts.length < (group.rules || []).length) return MATCH_NOTHING;
  return group.match === "any" ? { $or: parts } : { $and: parts };
}

export async function getFieldDefs(agentId: string): Promise<LeadFieldDef[]> {
  const rows = await LeadField.find({ agentId }).sort({ order: 1, createdAt: 1 }).lean();
  return rows.map((r) => ({
    _id: String(r._id), key: r.key, label: r.label, type: r.type, options: r.options ?? [],
    aiFill: !!r.aiFill, description: r.description ?? "", order: r.order,
  }));
}

/** Filter for one group of this workspace, or null when the group doesn't exist here. */
export async function groupFilterById(agentId: string, groupId: string): Promise<Filter | null> {
  if (!Types.ObjectId.isValid(groupId)) return null;
  const group = await LeadGroup.findOne({ _id: groupId, agentId }).lean();
  if (!group) return null;
  return groupFilter(group, await getFieldDefs(agentId));
}

/** Rules that no longer work (deleted field, bad value), for showing a warning on the group. */
export function brokenRules(group: Pick<ILeadGroup, "kind" | "rules">, defs: LeadFieldDef[]): string[] {
  if (group.kind !== "smart") return [];
  return (group.rules || []).map((r) => validateRule(r, defs)).filter((e): e is string => !!e);
}

/** The groups (manual + smart) a single lead belongs to. */
export async function groupsForLead(agentId: string, leadId: Types.ObjectId | string): Promise<ILeadGroup[]> {
  const [groups, defs] = await Promise.all([
    LeadGroup.find({ agentId }).lean<ILeadGroup[]>(),
    getFieldDefs(agentId),
  ]);
  if (groups.length === 0) return [];
  const matches = await Promise.all(
    groups.map((g) => Lead.exists({ _id: leadId, agentId, ...groupFilter(g, defs) }).then((hit) => (hit ? g : null))),
  );
  return matches.filter((g): g is ILeadGroup => !!g);
}

/** Count leads per group in one pass of queries (for the groups list). */
export async function countGroupMembers(agentId: string, groups: ILeadGroup[], defs: LeadFieldDef[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(groups.map(async (g) => {
    out[String(g._id)] = await Lead.countDocuments({ agentId, deletedAt: null, ...groupFilter(g, defs) });
  }));
  return out;
}

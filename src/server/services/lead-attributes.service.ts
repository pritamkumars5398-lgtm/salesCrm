import { Types } from "mongoose";
import { LeadGroup } from "@/lib/models/LeadGroup";
import { coerceFieldValue, normalizeTag, MAX_TAGS_PER_LEAD, LeadFieldDef } from "@/lib/lead-fields";
import { getFieldDefs } from "./lead-groups.service";

export const LEAD_STATUSES = ["new", "in_outreach", "replied", "meeting_booked", "closed"];
export const PIPELINE_STAGES = ["new", "contacted", "replied", "qualified", "closed"];

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validate a partial custom-field update against the workspace's field
 * definitions and merge it onto the current values. Unknown keys are refused
 * so a typo can't silently create data nobody can see.
 */
export function mergeCustomFields(
  defs: LeadFieldDef[],
  current: Record<string, unknown> | undefined,
  patch: unknown,
): Result<Record<string, unknown>> {
  if (patch === undefined) return { ok: true, value: current ?? {} };
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, error: "customFields must be an object." };
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [key, raw] of Object.entries(patch as Record<string, unknown>)) {
    const def = defs.find((d) => d.key === key);
    if (!def) return { ok: false, error: `"${key}" is not a field in this workspace.` };
    const { value, error } = coerceFieldValue(def, raw);
    if (error) return { ok: false, error };
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return { ok: true, value: next };
}

export function cleanTags(raw: unknown): Result<string[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "tags must be a list." };
  const tags = [...new Set(raw.map((t) => normalizeTag(String(t))).filter(Boolean))];
  if (tags.length > MAX_TAGS_PER_LEAD) return { ok: false, error: `A lead can have at most ${MAX_TAGS_PER_LEAD} tags.` };
  return { ok: true, value: tags };
}

/** Only this workspace's manual groups can be assigned by hand; smart groups are computed. */
export async function cleanGroupIds(agentId: string, raw: unknown): Promise<Result<Types.ObjectId[]>> {
  if (!Array.isArray(raw)) return { ok: false, error: "groupIds must be a list." };
  const ids = [...new Set(raw.map(String))];
  if (ids.some((id) => !Types.ObjectId.isValid(id))) return { ok: false, error: "Invalid group id." };
  if (ids.length === 0) return { ok: true, value: [] };
  const groups = await LeadGroup.find({ _id: { $in: ids }, agentId }).select("_id kind name").lean();
  if (groups.length !== ids.length) return { ok: false, error: "One of the groups doesn't exist in this workspace." };
  const smart = groups.find((g) => g.kind === "smart");
  if (smart) return { ok: false, error: `"${smart.name}" is a smart group — leads join it automatically from its rules.` };
  return { ok: true, value: groups.map((g) => g._id) };
}

/** Validate customFields/tags/groupIds on an incoming lead (create or import). */
export async function prepareNewLeadAttributes(
  agentId: string,
  input: { customFields?: unknown; tags?: unknown; groupIds?: unknown },
  defs?: LeadFieldDef[],
): Promise<Result<{ customFields: Record<string, unknown>; tags: string[]; groupIds: Types.ObjectId[] }>> {
  const fieldDefs = defs ?? (await getFieldDefs(agentId));
  const cf = mergeCustomFields(fieldDefs, {}, input.customFields);
  if (!cf.ok) return cf;
  const tags = input.tags === undefined ? { ok: true as const, value: [] } : cleanTags(input.tags);
  if (!tags.ok) return tags;
  const groups = input.groupIds === undefined ? { ok: true as const, value: [] } : await cleanGroupIds(agentId, input.groupIds);
  if (!groups.ok) return groups;
  return { ok: true, value: { customFields: cf.value, tags: tags.value, groupIds: groups.value } };
}

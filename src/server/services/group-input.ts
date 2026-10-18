import type { ILeadGroup } from "@/lib/models/LeadGroup";
import { GroupRule, LeadFieldDef, MAX_RULES_PER_GROUP, RuleOp, validateRule } from "@/lib/lead-fields";

type GroupInput = Pick<ILeadGroup, "name" | "color" | "kind" | "match" | "rules" | "playbook">;

const COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Validate a create/update body. `existing` is the stored group on update
 * (kind can't change: manual members would silently vanish, or a smart group
 * would suddenly have no members).
 */
export function cleanGroupInput(
  body: Record<string, unknown>,
  defs: LeadFieldDef[],
  existing: ILeadGroup | null,
): { ok: true; value: GroupInput } | { ok: false; error: string } {
  const name = String(body.name ?? existing?.name ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the group a name." };

  const kind = (existing?.kind ?? body.kind) === "smart" ? "smart" : "manual";
  if (existing && body.kind !== undefined && body.kind !== existing.kind) {
    return { ok: false, error: "A group can't switch between manual and smart — create a new group instead." };
  }

  const color = typeof body.color === "string" && COLOR_RE.test(body.color) ? body.color : existing?.color ?? "#6366f1";
  const match = (body.match ?? existing?.match) === "any" ? "any" : "all";
  const playbook = String(body.playbook ?? existing?.playbook ?? "").slice(0, 1500);

  let rules: GroupRule[] = existing?.rules ?? [];
  if (kind === "smart") {
    if (body.rules !== undefined) {
      if (!Array.isArray(body.rules)) return { ok: false, error: "rules must be a list." };
      rules = body.rules.map((r: Record<string, unknown>) => ({
        field: String(r?.field ?? ""),
        op: String(r?.op ?? "") as RuleOp,
        ...(r?.value !== undefined && r?.value !== "" ? { value: typeof r.value === "number" ? r.value : String(r.value) } : {}),
      }));
    }
    if (rules.length === 0) return { ok: false, error: "A smart group needs at least one rule." };
    if (rules.length > MAX_RULES_PER_GROUP) return { ok: false, error: `A group can have at most ${MAX_RULES_PER_GROUP} rules.` };
    for (const [i, rule] of rules.entries()) {
      const problem = validateRule(rule, defs);
      if (problem) return { ok: false, error: `Rule ${i + 1}: ${problem}` };
    }
  } else {
    rules = [];
  }

  return { ok: true, value: { name, color, kind, match, rules, playbook } };
}

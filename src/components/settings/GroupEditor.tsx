"use client";
import { useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  BUILTIN_RULE_FIELDS, MAX_RULES_PER_GROUP, OPS_BY_TYPE, ruleFieldInfo, validateRule,
  type GroupRule, type LeadFieldDef, type RuleOp,
} from "@/lib/lead-fields";
import type { LeadGroup, LeadGroupInput } from "@/lib/api/workspace.api";

interface Props {
  fields: LeadFieldDef[];
  initial: LeadGroup | null;
  onCancel: () => void;
  onSave: (input: LeadGroupInput) => Promise<void>;
}

const COLORS = ["#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#6366f1", "#ec4899", "#64748b"];

export default function GroupEditor({ fields, initial, onCancel, onSave }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[4]);
  const [kind, setKind] = useState<"manual" | "smart">(initial?.kind ?? "smart");
  const [match, setMatch] = useState<"all" | "any">(initial?.match ?? "all");
  const [rules, setRules] = useState<GroupRule[]>(initial?.rules?.length ? initial.rules : [{ field: "status", op: "equals", value: "new" }]);
  const [playbook, setPlaybook] = useState(initial?.playbook ?? "");
  const [saving, setSaving] = useState(false);

  const fieldChoices = [
    ...fields.map((f) => ({ key: `cf.${f.key}`, label: f.label })),
    ...BUILTIN_RULE_FIELDS.map((b) => ({ key: b.key, label: b.label })),
  ];
  const problems = kind === "smart" ? rules.map((r) => validateRule(r, fields)) : [];

  function setRule(i: number, patch: Partial<GroupRule>) {
    setRules((list) => list.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      // A new field may not support the old operator — fall back to its first one.
      if (patch.field !== undefined) {
        const info = ruleFieldInfo(next.field, fields);
        const ops = info ? OPS_BY_TYPE[info.type] : [];
        if (!ops.some((o) => o.op === next.op)) next.op = (ops[0]?.op ?? "equals") as RuleOp;
        next.value = undefined;
      }
      return next;
    }));
  }

  async function submit() {
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, kind, match, rules: kind === "smart" ? rules : [], playbook });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-bg4 bg-bg2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="form-input min-w-[180px] flex-1" placeholder="Group name, e.g. Hot hotels in Goa" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`} style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: c === color ? "2px solid var(--color-text)" : "2px solid transparent", cursor: "pointer" }} />
          ))}
        </div>
      </div>

      {!initial && (
        <div className="flex gap-2 text-[12.5px]">
          {(["smart", "manual"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className="flex-1 rounded-lg border px-3 py-2 text-left"
              style={{ borderColor: kind === k ? "var(--color-primary)" : "var(--color-bg4)", background: kind === k ? "var(--color-primary-subtle)" : "transparent" }}
            >
              <span className="block font-semibold text-text">{k === "smart" ? "Smart group" : "Manual group"}</span>
              <span className="block text-[11.5px] text-text3">{k === "smart" ? "Leads join automatically when they match the rules" : "You add leads by hand from the Leads page"}</span>
            </button>
          ))}
        </div>
      )}

      {kind === "smart" && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-text2">
            Leads that match{" "}
            <select className="form-input inline-block w-auto py-1" value={match} onChange={(e) => setMatch(e.target.value as "all" | "any")}>
              <option value="all">all</option>
              <option value="any">any</option>
            </select>{" "}
            of these rules:
          </p>
          {rules.map((rule, i) => {
            const info = ruleFieldInfo(rule.field, fields);
            const ops = info ? OPS_BY_TYPE[info.type] : [];
            const needsValue = ops.find((o) => o.op === rule.op)?.needsValue ?? true;
            const valueOptions = info?.options;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <select className="form-input min-w-[140px] flex-1" value={rule.field} onChange={(e) => setRule(i, { field: e.target.value })}>
                    {!info && <option value={rule.field}>(deleted field)</option>}
                    {fieldChoices.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <select className="form-input w-auto" value={rule.op} onChange={(e) => setRule(i, { op: e.target.value as RuleOp })}>
                    {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  {needsValue && (valueOptions?.length ? (
                    <select className="form-input min-w-[120px] flex-1" value={String(rule.value ?? "")} onChange={(e) => setRule(i, { value: e.target.value })}>
                      <option value="">Choose…</option>
                      {valueOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      className="form-input min-w-[120px] flex-1"
                      type={info?.type === "number" || rule.op === "in_last_days" || rule.op === "older_than_days" ? "number" : info?.type === "date" ? "date" : "text"}
                      value={String(rule.value ?? "")}
                      onChange={(e) => setRule(i, { value: e.target.value })}
                    />
                  ))}
                  <button onClick={() => setRules((l) => l.filter((_, idx) => idx !== i))} disabled={rules.length === 1} aria-label="Remove rule" className="text-text3 disabled:opacity-30">
                    <IconTrash size={15} />
                  </button>
                </div>
                {problems[i] && <p className="text-[11.5px] text-red-500">{problems[i]}</p>}
              </div>
            );
          })}
          {rules.length < MAX_RULES_PER_GROUP && (
            <button onClick={() => setRules((l) => [...l, { field: "status", op: "equals", value: "new" }])} className="flex items-center gap-1 self-start text-[12.5px] font-semibold text-text2">
              <IconPlus size={13} /> Add rule
            </button>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-text2">How should the AI approach these leads? (optional)</span>
        <textarea
          className="form-input"
          rows={3}
          maxLength={1500}
          placeholder="e.g. They already use another software — focus on how easy switching is and the free data migration."
          value={playbook}
          onChange={(e) => setPlaybook(e.target.value)}
        />
      </label>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-bg4 px-4 py-2 text-[13px] font-semibold text-text2">Cancel</button>
        <button
          onClick={submit}
          disabled={saving || !name.trim() || problems.some(Boolean)}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)" }}
        >
          {saving ? "Saving…" : initial ? "Save group" : "Create group"}
        </button>
      </div>
    </div>
  );
}

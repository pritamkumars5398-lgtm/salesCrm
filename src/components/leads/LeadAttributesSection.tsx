"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPencil, IconSparkles, IconX } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead } from "@/store/types";
import { formatFieldValue, normalizeTag, type LeadFieldDef } from "@/lib/lead-fields";
import { listLeadFields, listLeadGroups } from "@/lib/api/workspace.api";

interface Props {
  lead: Lead;
}

interface MatchedGroup {
  _id: string;
  name: string;
  color: string;
  kind: "manual" | "smart";
}

const heading: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)" };

function FieldInput({ def, value, onChange }: { def: LeadFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (def.type === "select") {
    return (
      <select className="form-input w-full" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (def.type === "multiselect") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1.5">
        {def.options.map((o) => {
          const on = list.includes(o);
          return (
            <button key={o} type="button" onClick={() => onChange(on ? list.filter((x) => x !== o) : [...list, o])}
              className="rounded-full border px-2 py-0.5 text-[11.5px]"
              style={{ borderColor: on ? "var(--color-primary-light)" : "var(--color-bg4)", background: on ? "var(--color-primary-subtle)" : "transparent", color: "var(--color-text2)" }}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (def.type === "boolean") {
    return (
      <select className="form-input w-full" value={value === true ? "yes" : value === false ? "no" : ""} onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "yes")}>
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  return (
    <input
      className="form-input w-full"
      type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Custom fields, tags and groups of one lead — viewable by everyone, editable in place. */
export default function LeadAttributesSection({ lead }: Props) {
  const { activeAgent, updateLead, showToast } = useAppStore();
  const queryClient = useQueryClient();
  const agentId = activeAgent?._id;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(lead.customFields ?? {});
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: fields = [] } = useQuery({ queryKey: ["lead-fields", agentId], queryFn: () => listLeadFields(agentId!), enabled: !!agentId });
  const { data: groups = [] } = useQuery({ queryKey: ["lead-groups", agentId], queryFn: () => listLeadGroups(agentId!), enabled: !!agentId });
  const { data: matched = [], refetch: refetchMatched } = useQuery<MatchedGroup[]>({
    queryKey: ["lead-matched-groups", lead._id, lead.updatedAt],
    queryFn: () => fetch(`/api/leads/${lead._id}?groups=1`).then((r) => r.json()).then((d) => d.matchedGroups ?? []),
  });

  useEffect(() => { setValues(lead.customFields ?? {}); setEditing(false); }, [lead._id, lead.customFields]);

  async function save(patch: Record<string, unknown>, success?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      updateLead(lead._id, data);
      refetchMatched();
      queryClient.invalidateQueries({ queryKey: ["lead-groups", agentId] });
      if (success) showToast(success, "success");
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function addTag() {
    const tag = normalizeTag(tagInput);
    if (!tag) return;
    setTagInput("");
    if (!(lead.tags ?? []).includes(tag)) save({ tags: [...(lead.tags ?? []), tag] });
  }

  const manualGroups = groups.filter((g) => g.kind === "manual");
  const memberOf = new Set((lead.groupIds ?? []).map(String));

  return (
    <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--color-bg4)" }} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <p style={heading}>Details</p>
          {fields.length > 0 && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11.5px] font-semibold text-text2"><IconPencil size={12} /> Edit</button>
          )}
        </div>
        {fields.length === 0 && <p className="text-[12px] text-text3">No custom fields — add them in Settings → Lead fields.</p>}
        {fields.map((def) => (
          <div key={def.key} className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-text3">
              {def.label}
              {def.aiFill && <IconSparkles size={11} title="The AI fills this from calls and replies" />}
            </span>
            {editing
              ? <FieldInput def={def} value={values[def.key]} onChange={(v) => setValues((p) => ({ ...p, [def.key]: v }))} />
              : <span className="text-[13px] text-text">{formatFieldValue(def, lead.customFields?.[def.key]) || <span className="text-text4">—</span>}</span>}
          </div>
        ))}
        {editing && (
          <div className="flex justify-end gap-2">
            <button onClick={() => { setValues(lead.customFields ?? {}); setEditing(false); }} className="rounded-lg border border-bg4 px-3 py-1.5 text-[12.5px] font-semibold text-text2">Cancel</button>
            <button
              onClick={async () => { if (await save({ customFields: values }, "Details saved")) setEditing(false); }}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)" }}
            >
              Save
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p style={heading}>Groups</p>
        <div className="flex flex-wrap gap-1.5">
          {matched.length === 0 && <span className="text-[12px] text-text3">Not in any group.</span>}
          {matched.map((g) => (
            <span key={g._id} className="inline-flex items-center gap-1 rounded-full border border-bg4 px-2 py-0.5 text-[11.5px] text-text2" title={g.kind === "smart" ? "Smart group — joined automatically" : "Manual group"}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: g.color }} />
              {g.name}
              {g.kind === "manual" && (
                <button aria-label={`Remove from ${g.name}`} onClick={() => save({ groupIds: [...memberOf].filter((id) => id !== g._id) })}><IconX size={11} /></button>
              )}
            </span>
          ))}
        </div>
        {manualGroups.some((g) => !memberOf.has(g._id)) && (
          <select
            className="form-input w-full"
            value=""
            onChange={(e) => e.target.value && save({ groupIds: [...memberOf, e.target.value] })}
          >
            <option value="">+ Add to a group…</option>
            {manualGroups.filter((g) => !memberOf.has(g._id)).map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p style={heading}>Tags</p>
        <div className="flex flex-wrap gap-1.5">
          {(lead.tags ?? []).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-bg3 px-2 py-0.5 text-[11.5px] text-text2">
              #{t}
              <button aria-label={`Remove tag ${t}`} onClick={() => save({ tags: (lead.tags ?? []).filter((x) => x !== t) })}><IconX size={11} /></button>
            </span>
          ))}
          <input
            className="form-input min-w-[120px] flex-1 py-1 text-[12px]"
            placeholder="Add tag + Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          />
        </div>
      </div>
    </div>
  );
}

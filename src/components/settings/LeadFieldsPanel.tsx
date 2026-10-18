"use client";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IconTrash, IconSparkles } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { LEAD_FIELD_TYPES, type LeadFieldDef, type LeadFieldType } from "@/lib/lead-fields";
import { DEFAULT_PIPELINE_LABELS } from "@/lib/constants/business-templates";
import { createLeadField, deleteLeadField, listLeadFields, updateLeadField } from "@/lib/api/workspace.api";
import { apiGet, apiPost } from "@/lib/api/client";
import SettingsToggle from "./SettingsToggle";

interface Props {
  readOnly: boolean;
}

type StageKey = keyof typeof DEFAULT_PIPELINE_LABELS;
const STAGES = Object.keys(DEFAULT_PIPELINE_LABELS) as StageKey[];

const sectionTitle = "text-[14px] font-semibold text-text";
const hint = "text-[12px] text-text3 leading-relaxed";

export default function LeadFieldsPanel({ readOnly }: Props) {
  const { activeAgent, showToast } = useAppStore();
  const queryClient = useQueryClient();
  const agentId = activeAgent?._id;
  const [fields, setFields] = useState<LeadFieldDef[]>([]);
  const [labels, setLabels] = useState<Record<StageKey, string>>({ ...DEFAULT_PIPELINE_LABELS });
  const [label, setLabel] = useState("");
  const [type, setType] = useState<LeadFieldType>("text");
  const [options, setOptions] = useState("");
  const [aiFill, setAiFill] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!agentId) return;
    try {
      const [defs, settings] = await Promise.all([
        listLeadFields(agentId),
        apiGet<Record<string, string>>(`/api/settings?agentId=${agentId}`),
      ]);
      setFields(defs);
      try {
        setLabels({ ...DEFAULT_PIPELINE_LABELS, ...JSON.parse(settings.pipelineLabels || "{}") });
      } catch {
        setLabels({ ...DEFAULT_PIPELINE_LABELS });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load fields", "error");
    }
  }, [agentId, showToast]);

  useEffect(() => { load(); }, [load]);

  async function addField() {
    if (!agentId || !label.trim()) return;
    setBusy(true);
    try {
      const needsOptions = type === "select" || type === "multiselect";
      await createLeadField(agentId, {
        label: label.trim(), type, aiFill,
        options: needsOptions ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      });
      setLabel(""); setOptions(""); setType("text");
      showToast("Field added", "success");
      queryClient.invalidateQueries({ queryKey: ["lead-fields", agentId] });
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not add the field", "error");
    } finally {
      setBusy(false);
    }
  }

  async function patchField(field: LeadFieldDef, patch: Partial<LeadFieldDef>) {
    try {
      await updateLeadField(field._id!, patch);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update the field", "error");
    }
  }

  async function removeField(field: LeadFieldDef) {
    if (!window.confirm(`Delete "${field.label}"? Its value is removed from every lead.`)) return;
    try {
      const res = await deleteLeadField(field._id!);
      if (res.affectedGroups.length) {
        showToast(`Removed. These smart groups used it and now need their rules fixed: ${res.affectedGroups.join(", ")}`, "error");
      } else {
        showToast("Field deleted", "success");
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not delete the field", "error");
    }
  }

  async function saveLabels() {
    if (!agentId) return;
    try {
      await apiPost("/api/settings", { agentId, settings: { pipelineLabels: JSON.stringify(labels) } });
      showToast("Pipeline stage names saved", "success");
      queryClient.invalidateQueries({ queryKey: ["pipeline-labels", agentId] });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save", "error");
    }
  }

  const editOptions = (field: LeadFieldDef) => {
    const next = window.prompt(
      `Options for "${field.label}", separated by commas.\nRemoving an option also clears it from leads that had it.`,
      field.options.join(", "),
    );
    if (next !== null) patchField(field, { options: next.split(",").map((o) => o.trim()).filter(Boolean) });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className={sectionTitle}>Lead fields</h3>
          <p className={hint}>
            The things that matter for this business — e.g. Rooms, Budget, Current software. Turn on
            <IconSparkles size={12} className="mx-1 inline" />AI fill and the AI sets the value from what the lead says on calls and in replies (every change is logged on the lead).
          </p>
        </div>

        {fields.length === 0 && <p className={hint}>No custom fields yet.</p>}
        {fields.map((f) => (
          <div key={f._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-bg4 bg-bg2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-text">{f.label}</p>
              <p className="truncate text-[11.5px] text-text3">
                {LEAD_FIELD_TYPES.find((t) => t.value === f.type)?.label}
                {f.options.length > 0 && ` · ${f.options.join(", ")}`}
              </p>
            </div>
            {!readOnly && (f.type === "select" || f.type === "multiselect") && (
              <button onClick={() => editOptions(f)} className="text-[12px] font-semibold text-text2 underline">Edit options</button>
            )}
            <span className="flex items-center gap-1.5 text-[11.5px] text-text3">
              AI fill
              <SettingsToggle checked={f.aiFill} onChange={(v) => !readOnly && patchField(f, { aiFill: v })} />
            </span>
            {!readOnly && (
              <button onClick={() => removeField(f)} aria-label={`Delete ${f.label}`} className="text-text3 hover:text-red-500">
                <IconTrash size={15} />
              </button>
            )}
          </div>
        ))}

        {!readOnly && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-bg4 p-3">
            <div className="flex flex-wrap gap-2">
              <input className="form-input min-w-[160px] flex-1" placeholder="Field name, e.g. Number of rooms" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
              <select className="form-input" value={type} onChange={(e) => setType(e.target.value as LeadFieldType)}>
                {LEAD_FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {(type === "select" || type === "multiselect") && (
              <input className="form-input" placeholder="Options, separated by commas — e.g. Hot, Warm, Cold" value={options} onChange={(e) => setOptions(e.target.value)} />
            )}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[12px] text-text2">
                <SettingsToggle checked={aiFill} onChange={setAiFill} /> Let the AI fill it in
              </span>
              <button
                onClick={addField}
                disabled={busy || !label.trim()}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)" }}
              >
                Add field
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className={sectionTitle}>Pipeline stage names</h3>
          <p className={hint}>Rename the CRM columns to match how this business sells (e.g. &quot;Demo booked&quot; instead of &quot;Qualified&quot;). The stages and their automation stay the same.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STAGES.map((stage) => (
            <label key={stage} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text3">{DEFAULT_PIPELINE_LABELS[stage]}</span>
              <input
                className="form-input"
                value={labels[stage]}
                maxLength={30}
                disabled={readOnly}
                onChange={(e) => setLabels((p) => ({ ...p, [stage]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {!readOnly && (
          <div className="flex justify-end">
            <button onClick={saveLabels} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)" }}>
              Save stage names
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

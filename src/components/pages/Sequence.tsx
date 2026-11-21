"use client";
import { useEffect, useMemo, useState } from "react";
import { IconPlus, IconDeviceFloppy, IconRoute, IconHandStop } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_SEQUENCE_STEPS, SEQUENCE_TEMPLATES, type SequenceStep } from "@/lib/constants/sequence";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";
import SequenceStepCard from "@/components/sequence/SequenceStepCard";

/** Which customer-safe channel status (from /api/channels) each sequence channel depends on. */
const STATUS_KEY: Record<string, string> = { email: "email", whatsapp: "whatsapp", sms: "sms", call: "calls" };

/**
 * The follow-up plan: which channel the AI uses on which day, in one simple column.
 * Outreach always stops for a lead once they reply, or after the last step.
 */
export default function Sequence() {
  const { activeAgent, showToast } = useAppStore();
  const queryClient = useQueryClient();
  const [steps, setSteps] = useState<SequenceStep[]>(DEFAULT_SEQUENCE_STEPS);
  const [sequenceName, setSequenceName] = useState("Cold outreach");
  const [savedJson, setSavedJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [channelStates, setChannelStates] = useState<Record<string, string>>({});

  const { data: sequences } = useQuery<any[]>({
    queryKey: ["sequences", activeAgent?._id],
    queryFn: async () => {
      const res = await fetch(`/api/sequences?agentId=${activeAgent!._id}`);
      if (!res.ok) throw new Error("Failed to load sequence");
      return res.json();
    },
    enabled: !!activeAgent,
  });

  // This page edits in local state, so rehydrate it whenever the cached/fetched sequence arrives.
  useEffect(() => {
    if (!sequences) return;
    const seq = sequences[0];
    const s = seq?.steps || DEFAULT_SEQUENCE_STEPS;
    const n = seq?.name || "Cold outreach";
    setSteps(s);
    setSequenceName(n);
    setSavedJson(JSON.stringify({ s, n }));
  }, [sequences]);

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/channels?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((d: { channels?: { key: string; state: string }[] }) => setChannelStates(Object.fromEntries((d.channels ?? []).map((c) => [c.key, c.state]))))
      .catch(() => {});
  }, [activeAgent?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = savedJson !== "" && JSON.stringify({ s: steps, n: sequenceName }) !== savedJson;
  const lastDay = useMemo(() => Math.max(0, ...steps.map((s) => s.dayOffset)), [steps]);

  function addStep() {
    const last = steps[steps.length - 1];
    setSteps((p) => [...p, { order: p.length + 1, channel: last?.channel === "email" ? "whatsapp" : "email", dayOffset: (last?.dayOffset ?? 0) + 1, sendTime: last?.sendTime ?? "10:00" }]);
  }

  function removeStep(i: number) {
    setSteps((p) => p.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx + 1 })));
  }

  function updateStep(i: number, patch: Partial<SequenceStep>) {
    setSteps((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function saveSequence() {
    if (!activeAgent) return;
    setSaving(true);
    try {
      // Keep steps in day order so "step 2" really comes after "step 1".
      const ordered = [...steps].sort((a, b) => a.dayOffset - b.dayOffset || a.sendTime.localeCompare(b.sendTime)).map((s, i) => ({ ...s, order: i + 1 }));
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, name: sequenceName.trim() || "Follow-up plan", steps: ordered, afterNoReply: "stop" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save");
      setSteps(ordered);
      queryClient.invalidateQueries({ queryKey: ["sequences", activeAgent._id] });
      showToast("Follow-up plan saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--color-bg)" }}>
      <div className="w-full max-w-[720px] mx-auto px-5 sm:px-8 py-7 pb-28 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(223,42,42,0.1)" }}>
            <IconRoute size={20} style={{ color: "#df2a2a" }} />
          </span>
          <div>
            <h2 className="text-[20px] font-bold text-text m-0">Follow-up plan</h2>
            <p className="text-[13px] text-text3 m-0 mt-1">How and when your AI contacts each new lead. It stops by itself as soon as the lead replies.</p>
          </div>
        </div>

        {/* Quick start */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold text-text2">Start from a ready plan</span>
          <div className="flex gap-2 flex-wrap">
            {SEQUENCE_TEMPLATES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => { setSteps(t.steps); setSequenceName(t.name); showToast(`"${t.name}" loaded — press Save to use it`); }}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border border-bg4 bg-bg2 cursor-pointer text-left hover:border-[#df2a2a]"
              >
                <span className="text-[13px] font-semibold text-text">{t.name}</span>
                <span className="flex items-center gap-1 text-[11.5px] text-text3">
                  {t.steps.map((s, i) => {
                    const c = CHANNEL_CONFIG[s.channel];
                    return <c.Icon key={i} size={12} style={{ color: c.color }} />;
                  })}
                  <span className="ml-1">{t.meta}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text2">Plan name</span>
          <input value={sequenceName} onChange={(e) => setSequenceName(e.target.value)} placeholder="e.g. Cold outreach" className="form-input text-[13px]" />
        </label>

        {/* Steps */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-semibold text-text2">Steps</span>
            <span className="text-[12px] text-text3">{steps.length} step{steps.length === 1 ? "" : "s"} over {lastDay} day{lastDay === 1 ? "" : "s"}</span>
          </div>
          {steps.map((step, i) => (
            <SequenceStepCard
              key={i}
              step={step}
              isLast={i === steps.length - 1}
              prevDay={i > 0 ? steps[i - 1].dayOffset : undefined}
              notReady={!!channelStates[STATUS_KEY[step.channel]] && channelStates[STATUS_KEY[step.channel]] === "not_set_up"}
              canRemove={steps.length > 1}
              onChange={(patch) => updateStep(i, patch)}
              onRemove={() => removeStep(i)}
            />
          ))}
          <button
            type="button"
            onClick={addStep}
            disabled={steps.length >= 10}
            className="ml-[42px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer disabled:opacity-40"
            style={{ border: "1.5px dashed var(--color-bg4)", background: "transparent", color: "var(--color-text2)" }}
          >
            <IconPlus size={14} /> Add a step
          </button>
        </div>

        {/* How it stops */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-bg4 bg-bg2 text-[12.5px] text-text2">
          <IconHandStop size={16} className="shrink-0 mt-0.5 text-text3" />
          <span>
            The plan stops for a lead as soon as they reply on any channel — the rest of the steps are cancelled. If they never reply, it simply ends after the last step.
          </span>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 border-t border-bg4" style={{ background: "var(--color-bg)" }}>
        <div className="w-full max-w-[720px] mx-auto px-5 sm:px-8 py-3 flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-text3">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
          <button
            onClick={saveSequence}
            disabled={saving || !dirty}
            className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold text-white border-none cursor-pointer disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)" }}
          >
            <IconDeviceFloppy size={15} /> {saving ? "Saving…" : "Save plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

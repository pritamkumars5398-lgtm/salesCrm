"use client";
import { useState } from "react";
import { IconPlus, IconDeviceFloppy, IconSparkles, IconLayoutList } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { DEFAULT_SEQUENCE_STEPS, type SequenceStep } from "@/lib/constants/sequence";
import SequenceStepCard from "@/components/sequence/SequenceStepCard";
import SequenceTemplatePanel from "@/components/sequence/SequenceTemplatePanel";

export default function Sequence() {
  const { activeAgent, showToast } = useAppStore();
  const [steps, setSteps] = useState<SequenceStep[]>(DEFAULT_SEQUENCE_STEPS);
  const [afterNoReply, setAfterNoReply] = useState("stop");
  const [sequenceName, setSequenceName] = useState("Cold outreach");

  function addStep() {
    const next = steps.length + 1;
    setSteps((p) => [...p, { order: next, channel: "email", dayOffset: next, sendTime: "09:00" }]);
  }

  function removeStep(i: number) {
    setSteps((p) => p.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx + 1 })));
  }

  function updateStep(i: number, patch: Partial<SequenceStep>) {
    setSteps((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function saveSequence() {
    if (!activeAgent) return;
    await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: activeAgent._id, name: sequenceName, steps, afterNoReply }),
    });
    showToast("Sequence saved");
  }

  return (
    <div className="flex h-full" style={{ background: "var(--color-bg)" }}>
      {/* ── Main builder ── */}
      <div className="flex-1 overflow-y-auto p-8" style={{ maxWidth: 600 }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(99,102,241,0.1)" }}>
            <IconLayoutList size={20} style={{ color: "#6366f1" }} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold leading-tight" style={{ color: "var(--color-text)" }}>Sequence builder</h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text3)" }}>Set timing and channel rules for outreach</p>
          </div>
        </div>

        {/* Name */}
        <div className="flex flex-col gap-1.5 mb-6">
          <label className="text-[12px] font-semibold" style={{ color: "var(--color-text2)" }}>Sequence name</label>
          <input
            value={sequenceName}
            onChange={(e) => setSequenceName(e.target.value)}
            placeholder="e.g. Cold outreach"
            className="rounded-[10px] px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
          />
        </div>

        <div style={{ height: 1, background: "var(--color-bg4)", marginBottom: 24 }} />

        {/* Steps */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text3)" }}>Steps</p>
          <button
            onClick={addStep}
            className="flex items-center gap-1.5 transition-all duration-150 active:scale-95"
            style={{ padding: "6px 14px", borderRadius: 8, background: "rgba(99,102,241,0.1)", border: "none", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <IconPlus size={13} /> Add step
          </button>
        </div>

        <div className="flex flex-col">
          {steps.map((step, i) => (
            <SequenceStepCard
              key={i}
              step={step}
              index={i}
              isLast={i === steps.length - 1}
              onChange={(patch) => updateStep(i, patch)}
              onRemove={() => removeStep(i)}
            />
          ))}
        </div>

        <div style={{ height: 1, background: "var(--color-bg4)", margin: "16px 0 20px" }} />

        {/* After no reply */}
        <div className="flex flex-col gap-1.5 mb-4">
          <label className="text-[12px] font-semibold" style={{ color: "var(--color-text2)" }}>After last step — no reply</label>
          <select
            value={afterNoReply}
            onChange={(e) => setAfterNoReply(e.target.value)}
            className="rounded-[10px] px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", color: "var(--color-text)", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
          >
            <option value="stop">Stop outreach</option>
            <option value="restart">Restart from Day 1</option>
            <option value="notify">Notify me</option>
          </select>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-[10px] text-[12px] mb-6" style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", color: "#6366f1" }}>
          <IconSparkles size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          Smart stop — if a lead replies on any channel, remaining steps cancel automatically.
        </div>

        <button
          onClick={saveSequence}
          className="flex items-center justify-center gap-2 w-full transition-all duration-150 active:scale-[0.98]"
          style={{ padding: "10px 20px", borderRadius: 10, background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(79,70,229,0.28)" }}
        >
          <IconDeviceFloppy size={15} /> Save sequence
        </button>
      </div>

      <SequenceTemplatePanel
        steps={steps}
        onLoad={(s, name) => { setSteps(s); setSequenceName(name); showToast(`"${name}" loaded`); }}
      />
    </div>
  );
}

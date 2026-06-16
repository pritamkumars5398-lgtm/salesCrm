"use client";
import { useState } from "react";
import {
  IconMail, IconBrandWhatsapp, IconMessage, IconPhone,
  IconPlus, IconTrash, IconDeviceFloppy, IconSparkles, IconLayoutList,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Channel } from "@/store/types";

interface Step {
  order: number;
  channel: Channel;
  dayOffset: number;
  sendTime: string;
}

const TEMPLATES = [
  {
    name: "Cold outreach",
    desc: "Email → WA → SMS → Call",
    meta: "4 steps · 4 days",
    steps: [
      { order: 1, channel: "email" as Channel, dayOffset: 1, sendTime: "10:00" },
      { order: 2, channel: "whatsapp" as Channel, dayOffset: 2, sendTime: "11:00" },
      { order: 3, channel: "sms" as Channel, dayOffset: 3, sendTime: "15:00" },
      { order: 4, channel: "call" as Channel, dayOffset: 4, sendTime: "10:00" },
    ],
  },
  {
    name: "Email drip",
    desc: "3 follow-up emails",
    meta: "3 steps · 7 days",
    steps: [
      { order: 1, channel: "email" as Channel, dayOffset: 1, sendTime: "09:00" },
      { order: 2, channel: "email" as Channel, dayOffset: 3, sendTime: "10:00" },
      { order: 3, channel: "email" as Channel, dayOffset: 7, sendTime: "09:00" },
    ],
  },
  {
    name: "WA + Call",
    desc: "Message then voice call",
    meta: "2 steps · 2 days",
    steps: [
      { order: 1, channel: "whatsapp" as Channel, dayOffset: 1, sendTime: "10:00" },
      { order: 2, channel: "call" as Channel, dayOffset: 2, sendTime: "11:00" },
    ],
  },
];

const CHANNEL_META: Record<Channel, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  email:    { label: "Email",     Icon: IconMail,           color: "#4dabf7", bg: "rgba(77,171,247,0.12)" },
  whatsapp: { label: "WhatsApp",  Icon: IconBrandWhatsapp,  color: "#22c97a", bg: "rgba(34,201,122,0.12)" },
  sms:      { label: "SMS",       Icon: IconMessage,        color: "#cc99ff", bg: "rgba(204,153,255,0.12)" },
  call:     { label: "Voice call",Icon: IconPhone,          color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
};

export default function Sequence() {
  const { activeAgent, showToast } = useAppStore();
  const [steps, setSteps] = useState<Step[]>([
    { order: 1, channel: "email",    dayOffset: 1, sendTime: "10:00" },
    { order: 2, channel: "whatsapp", dayOffset: 2, sendTime: "11:00" },
    { order: 3, channel: "sms",      dayOffset: 3, sendTime: "15:00" },
    { order: 4, channel: "call",     dayOffset: 4, sendTime: "10:00" },
  ]);
  const [afterNoReply, setAfterNoReply] = useState("stop");
  const [sequenceName, setSequenceName] = useState("Cold outreach");

  function addStep() {
    const next = steps.length + 1;
    setSteps((p) => [...p, { order: next, channel: "email", dayOffset: next, sendTime: "09:00" }]);
  }

  function removeStep(i: number) {
    setSteps((p) => p.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx + 1 })));
  }

  function updateStep(i: number, patch: Partial<Step>) {
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
          <span
            className="flex items-center justify-center"
            style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(99,102,241,0.1)" }}
          >
            <IconLayoutList size={20} style={{ color: "#6366f1" }} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold leading-tight" style={{ color: "var(--color-text)" }}>
              Sequence builder
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text3)" }}>
              Set timing and channel rules for outreach
            </p>
          </div>
        </div>

        {/* Sequence name */}
        <div className="flex flex-col gap-1.5 mb-6">
          <label className="text-[12px] font-semibold" style={{ color: "var(--color-text2)" }}>
            Sequence name
          </label>
          <input
            value={sequenceName}
            onChange={(e) => setSequenceName(e.target.value)}
            placeholder="e.g. Cold outreach"
            className="rounded-[10px] px-3 py-2.5 text-[13px] outline-none"
            style={{
              background: "var(--color-bg2)",
              border: "1px solid var(--color-bg4)",
              color: "var(--color-text)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          />
        </div>

        <div style={{ height: 1, background: "var(--color-bg4)", marginBottom: 24 }} />

        {/* Steps label + add */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-text3)" }}>
            Steps
          </p>
          <button
            onClick={addStep}
            className="flex items-center gap-1.5 transition-all duration-150 active:scale-95"
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: "rgba(99,102,241,0.1)",
              border: "none",
              color: "#6366f1",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <IconPlus size={13} /> Add step
          </button>
        </div>

        {/* Timeline */}
        <div className="flex flex-col">
          {steps.map((step, i) => {
            const ch = CHANNEL_META[step.channel];
            return (
              <div key={i} className="flex gap-3">
                {/* Connector column */}
                <div className="flex flex-col items-center" style={{ width: 32, flexShrink: 0 }}>
                  <div
                    className="flex items-center justify-center text-[11px] font-semibold"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "rgba(99,102,241,0.1)",
                      color: "#6366f1",
                      flexShrink: 0,
                    }}
                  >
                    {step.order}
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: "var(--color-bg4)", margin: "4px 0", minHeight: 24 }} />
                  )}
                </div>

                {/* Step card */}
                <div
                  className="flex-1 flex items-center gap-3 mb-3"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "var(--color-bg2)",
                    border: "1px solid var(--color-bg4)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  {/* Channel icon */}
                  <span
                    className="shrink-0 flex items-center justify-center"
                    style={{ width: 32, height: 32, borderRadius: 9, background: ch.bg }}
                  >
                    <ch.Icon size={16} style={{ color: ch.color }} />
                  </span>

                  {/* Channel select */}
                  <select
                    value={step.channel}
                    onChange={(e) => updateStep(i, { channel: e.target.value as Channel })}
                    className="outline-none text-[12.5px] font-semibold"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--color-text)",
                      cursor: "pointer",
                      width: 108,
                    }}
                  >
                    {Object.entries(CHANNEL_META).map(([v, m]) => (
                      <option key={v} value={v}>{m.label}</option>
                    ))}
                  </select>

                  <div className="w-px self-stretch mx-1" style={{ background: "var(--color-bg4)" }} />

                  {/* Day */}
                  <span className="text-[12px]" style={{ color: "var(--color-text3)", whiteSpace: "nowrap" }}>Day</span>
                  <input
                    type="number"
                    min={1}
                    value={step.dayOffset}
                    onChange={(e) => updateStep(i, { dayOffset: Number(e.target.value) })}
                    className="outline-none text-center font-mono text-[13px]"
                    style={{
                      width: 44,
                      padding: "4px 6px",
                      borderRadius: 7,
                      border: "1px solid var(--color-bg4)",
                      background: "var(--color-bg3)",
                      color: "var(--color-text)",
                    }}
                  />

                  <span className="text-[12px]" style={{ color: "var(--color-text3)" }}>at</span>

                  {/* Time */}
                  <input
                    type="time"
                    value={step.sendTime}
                    onChange={(e) => updateStep(i, { sendTime: e.target.value })}
                    className="outline-none font-mono text-[12.5px]"
                    style={{
                      padding: "4px 7px",
                      borderRadius: 7,
                      border: "1px solid var(--color-bg4)",
                      background: "var(--color-bg3)",
                      color: "var(--color-text)",
                    }}
                  />

                  {/* Delete */}
                  <button
                    onClick={() => removeStep(i)}
                    className="ml-auto transition-opacity duration-150"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#cbd5e1",
                      padding: 4,
                      borderRadius: 6,
                      display: "flex",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#cbd5e1")}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ height: 1, background: "var(--color-bg4)", margin: "16px 0 20px" }} />

        {/* After no reply */}
        <div className="flex flex-col gap-1.5 mb-4">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-semibold" style={{ color: "var(--color-text2)" }}>
              After last step — no reply
            </label>
          </div>
          <select
            value={afterNoReply}
            onChange={(e) => setAfterNoReply(e.target.value)}
            className="rounded-[10px] px-3 py-2.5 text-[13px] outline-none"
            style={{
              background: "var(--color-bg2)",
              border: "1px solid var(--color-bg4)",
              color: "var(--color-text)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <option value="stop">Stop outreach</option>
            <option value="restart">Restart from Day 1</option>
            <option value="notify">Notify me</option>
          </select>
        </div>

        {/* Smart stop hint */}
        <div
          className="flex items-start gap-2 p-3 rounded-[10px] text-[12px] mb-6"
          style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", color: "#6366f1" }}
        >
          <IconSparkles size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          Smart stop — if a lead replies on any channel, remaining steps cancel automatically.
        </div>

        {/* Save */}
        <button
          onClick={saveSequence}
          className="flex items-center justify-center gap-2 w-full transition-all duration-150 active:scale-[0.98]"
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #4f46e5, #6366f1)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(79,70,229,0.28)",
          }}
        >
          <IconDeviceFloppy size={15} /> Save sequence
        </button>
      </div>

      {/* ── Right panel: Templates ── */}
      <div
        className="flex flex-col gap-0 shrink-0 overflow-y-auto"
        style={{
          width: 260,
          borderLeft: "1px solid var(--color-bg4)",
          background: "var(--color-bg2)",
          padding: "28px 16px",
        }}
      >
        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-3" style={{ color: "var(--color-text3)" }}>
          Templates
        </p>
        <div className="flex flex-col gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => { setSteps(t.steps); setSequenceName(t.name); showToast(`"${t.name}" loaded`); }}
              className="text-left transition-all duration-150"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--color-bg3)",
                border: "1px solid var(--color-bg4)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#6366f1";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-bg4)";
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)";
              }}
            >
              <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--color-text)" }}>
                {t.name}
              </p>
              <p className="text-[11.5px] mt-0.5" style={{ color: "var(--color-text3)" }}>
                {t.desc}
              </p>
              <p className="text-[10.5px] mt-1.5 font-medium" style={{ color: "#6366f1" }}>
                {t.meta}
              </p>
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: "var(--color-bg4)", margin: "20px 8px" }} />

        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-3" style={{ color: "var(--color-text3)" }}>
          Channels used
        </p>
        <div className="flex flex-col gap-1.5 px-2">
          {Object.entries(CHANNEL_META).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="flex items-center justify-center"
                style={{ width: 24, height: 24, borderRadius: 7, background: meta.bg, flexShrink: 0 }}
              >
                <meta.Icon size={13} style={{ color: meta.color }} />
              </span>
              <span className="text-[12px]" style={{ color: "var(--color-text2)" }}>{meta.label}</span>
              <span
                className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--color-bg4)", color: "var(--color-text3)" }}
              >
                {steps.filter((s) => s.channel === key).length}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

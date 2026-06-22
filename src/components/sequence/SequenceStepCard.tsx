"use client";
import { IconTrash } from "@tabler/icons-react";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";
import type { SequenceStep } from "@/lib/constants/sequence";
import type { Channel } from "@/store/types";

interface Props {
  step: SequenceStep;
  index: number;
  isLast: boolean;
  onChange: (patch: Partial<SequenceStep>) => void;
  onRemove: () => void;
}

export default function SequenceStepCard({ step, index, isLast, onChange, onRemove }: Props) {
  const ch = CHANNEL_CONFIG[step.channel];
  return (
    <div className="flex gap-3">
      {/* Connector column */}
      <div className="flex flex-col items-center" style={{ width: 32, flexShrink: 0 }}>
        <div
          className="flex items-center justify-center text-[11px] font-semibold"
          style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(99,102,241,0.1)", color: "#6366f1", flexShrink: 0 }}
        >
          {step.order}
        </div>
        {!isLast && (
          <div style={{ width: 1, flex: 1, background: "var(--color-bg4)", margin: "4px 0", minHeight: 24 }} />
        )}
      </div>

      {/* Card */}
      <div
        className="flex-1 flex items-center gap-3 mb-3"
        style={{ padding: "10px 14px", borderRadius: 12, background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
      >
        <span className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 9, background: ch.bg }}>
          <ch.Icon size={16} style={{ color: ch.color }} />
        </span>

        <select
          value={step.channel}
          onChange={(e) => onChange({ channel: e.target.value as Channel })}
          className="outline-none text-[12.5px] font-semibold"
          style={{ background: "transparent", border: "none", color: "var(--color-text)", cursor: "pointer", width: 108 }}
        >
          {(Object.entries(CHANNEL_CONFIG) as [Channel, typeof CHANNEL_CONFIG[Channel]][]).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>

        <div className="w-px self-stretch mx-1" style={{ background: "var(--color-bg4)" }} />

        <span className="text-[12px]" style={{ color: "var(--color-text3)", whiteSpace: "nowrap" }}>Day</span>
        <input
          type="number"
          min={1}
          value={step.dayOffset}
          onChange={(e) => onChange({ dayOffset: Number(e.target.value) })}
          className="outline-none text-center font-mono text-[13px]"
          style={{ width: 44, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--color-bg4)", background: "var(--color-bg3)", color: "var(--color-text)" }}
        />

        <span className="text-[12px]" style={{ color: "var(--color-text3)" }}>at</span>

        <input
          type="time"
          value={step.sendTime}
          onChange={(e) => onChange({ sendTime: e.target.value })}
          className="outline-none font-mono text-[12.5px]"
          style={{ padding: "4px 7px", borderRadius: 7, border: "1px solid var(--color-bg4)", background: "var(--color-bg3)", color: "var(--color-text)" }}
        />

        <button
          onClick={onRemove}
          className="ml-auto transition-opacity duration-150"
          style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", padding: 4, borderRadius: 6, display: "flex" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#cbd5e1")}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}

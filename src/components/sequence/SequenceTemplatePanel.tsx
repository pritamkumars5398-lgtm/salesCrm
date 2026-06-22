"use client";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";
import { SEQUENCE_TEMPLATES, type SequenceStep } from "@/lib/constants/sequence";

interface Props {
  steps: SequenceStep[];
  onLoad: (steps: SequenceStep[], name: string) => void;
}

export default function SequenceTemplatePanel({ steps, onLoad }: Props) {
  return (
    <div
      className="flex flex-col gap-0 shrink-0 overflow-y-auto"
      style={{ width: 260, borderLeft: "1px solid var(--color-bg4)", background: "var(--color-bg2)", padding: "28px 16px" }}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-3" style={{ color: "var(--color-text3)" }}>
        Templates
      </p>
      <div className="flex flex-col gap-2">
        {SEQUENCE_TEMPLATES.map((t) => (
          <button
            key={t.name}
            onClick={() => onLoad(t.steps, t.name)}
            className="text-left transition-all duration-150"
            style={{ padding: "12px 14px", borderRadius: 12, background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", cursor: "pointer" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#6366f1";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-bg4)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)";
            }}
          >
            <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--color-text)" }}>{t.name}</p>
            <p className="text-[11.5px] mt-0.5" style={{ color: "var(--color-text3)" }}>{t.desc}</p>
            <p className="text-[10.5px] mt-1.5 font-medium" style={{ color: "#6366f1" }}>{t.meta}</p>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: "var(--color-bg4)", margin: "20px 8px" }} />

      <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-3" style={{ color: "var(--color-text3)" }}>
        Channels used
      </p>
      <div className="flex flex-col gap-1.5 px-2">
        {(Object.entries(CHANNEL_CONFIG) as [string, typeof CHANNEL_CONFIG[keyof typeof CHANNEL_CONFIG]][]).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="flex items-center justify-center" style={{ width: 24, height: 24, borderRadius: 7, background: meta.bg, flexShrink: 0 }}>
              <meta.Icon size={13} style={{ color: meta.color }} />
            </span>
            <span className="text-[12px]" style={{ color: "var(--color-text2)" }}>{meta.label}</span>
            <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "var(--color-bg4)", color: "var(--color-text3)" }}>
              {steps.filter((s) => s.channel === key).length}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

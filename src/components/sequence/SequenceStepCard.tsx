"use client";
import { IconMinus, IconPlus, IconTrash, IconAlertTriangle } from "@tabler/icons-react";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";
import { isComingSoonChannel } from "@/lib/constants/coming-soon";
import SoonBadge from "@/components/ui/SoonBadge";
import type { SequenceStep } from "@/lib/constants/sequence";
import type { Channel } from "@/store/types";

interface Props {
  step: SequenceStep;
  isLast: boolean;
  /** day of the step before, to warn when this one comes earlier */
  prevDay?: number;
  /** channels the admin hasn't set up yet (the step would be skipped) */
  notReady?: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<SequenceStep>) => void;
  onRemove: () => void;
}

/** 8 AM … 8 PM, every half hour — friendlier than a raw time box. */
const TIMES = Array.from({ length: 25 }, (_, i) => {
  const mins = 8 * 60 + i * 30;
  const h = Math.floor(mins / 60), m = mins % 60;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const label = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { value, label };
});

export function timeLabel(v: string) {
  return TIMES.find((t) => t.value === v)?.label ?? v;
}

const ACTION: Record<Channel, string> = {
  email: "send an email",
  whatsapp: "send a WhatsApp message",
  sms: "send an SMS",
  call: "make an AI phone call",
};

export default function SequenceStepCard({ step, isLast, prevDay, notReady, canRemove, onChange, onRemove }: Props) {
  const ch = CHANNEL_CONFIG[step.channel];
  const early = prevDay !== undefined && step.dayOffset < prevDay;
  const times = TIMES.some((t) => t.value === step.sendTime) ? TIMES : [{ value: step.sendTime, label: step.sendTime }, ...TIMES];

  return (
    <div className="flex gap-3">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 30 }}>
        <span className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: ch.bg }}>
          <ch.Icon size={15} style={{ color: ch.color }} />
        </span>
        {!isLast && <span style={{ width: 2, flex: 1, minHeight: 20, background: "var(--color-bg4)", margin: "4px 0", borderRadius: 2 }} />}
      </div>

      <div className="flex-1 min-w-0 mb-3 rounded-xl border border-bg4 bg-bg2 p-3.5 flex flex-col gap-3">
        {/* Channel */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.entries(CHANNEL_CONFIG) as [Channel, (typeof CHANNEL_CONFIG)[Channel]][]).map(([key, c]) => {
            const on = key === step.channel;
            const soon = isComingSoonChannel(key);
            return (
              <button
                key={key}
                type="button"
                disabled={soon}
                title={soon ? `${c.label} is coming soon` : undefined}
                onClick={() => onChange({ channel: key })}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold border ${soon ? "cursor-default opacity-60" : "cursor-pointer"}`}
                style={{ background: on ? c.bg : "transparent", borderColor: on ? c.color : "var(--color-bg4)", color: on ? c.color : "var(--color-text3)" }}
              >
                <c.Icon size={14} /> {c.label}
                {soon && <SoonBadge />}
              </button>
            );
          })}
          {canRemove && (
            <button type="button" onClick={onRemove} title="Remove this step" aria-label="Remove this step" className="ml-auto p-1.5 rounded-md cursor-pointer bg-transparent border-none text-text3 hover:text-[#ef4444]">
              <IconTrash size={15} />
            </button>
          )}
        </div>

        {/* When */}
        <div className="flex items-center gap-2 flex-wrap text-[13px] text-text2">
          <span>On day</span>
          <div className="flex items-center rounded-lg border border-bg4 bg-bg3 overflow-hidden">
            <button type="button" aria-label="Earlier day" disabled={step.dayOffset <= 1} onClick={() => onChange({ dayOffset: Math.max(1, step.dayOffset - 1) })} className="px-2 py-1.5 bg-transparent border-none cursor-pointer text-text2 disabled:opacity-30">
              <IconMinus size={13} />
            </button>
            <span className="w-8 text-center font-semibold text-text">{step.dayOffset}</span>
            <button type="button" aria-label="Later day" disabled={step.dayOffset >= 60} onClick={() => onChange({ dayOffset: Math.min(60, step.dayOffset + 1) })} className="px-2 py-1.5 bg-transparent border-none cursor-pointer text-text2 disabled:opacity-30">
              <IconPlus size={13} />
            </button>
          </div>
          <span>at</span>
          <select value={step.sendTime} onChange={(e) => onChange({ sendTime: e.target.value })} className="form-input text-[13px] py-1.5" style={{ width: "auto" }}>
            {times.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <p className="text-[12px] text-text3 m-0">
          Day {step.dayOffset}, {timeLabel(step.sendTime)} → the AI will {ACTION[step.channel]}.
        </p>
        {early && (
          <p className="text-[12px] m-0 flex items-center gap-1.5" style={{ color: "#f59e0b" }}>
            <IconAlertTriangle size={13} /> This step is on an earlier day than the one before it.
          </p>
        )}
        {isComingSoonChannel(step.channel) ? (
          <p className="text-[12px] m-0 flex items-center gap-1.5" style={{ color: "#8b5cf6" }}>
            <IconAlertTriangle size={13} /> SMS is coming soon — this step is skipped for now. Pick another channel above.
          </p>
        ) : notReady && (
          <p className="text-[12px] m-0 flex items-center gap-1.5" style={{ color: "#f59e0b" }}>
            <IconAlertTriangle size={13} /> {ch.label} isn&rsquo;t set up for you yet — this step will be skipped until your admin sets it up.
          </p>
        )}
      </div>
    </div>
  );
}

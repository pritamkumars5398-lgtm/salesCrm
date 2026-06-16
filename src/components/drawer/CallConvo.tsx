"use client";
import { useState } from "react";
import { IconPlayerPlay, IconPlayerPause, IconPhone, IconMicrophone } from "@tabler/icons-react";
import type { Message, Lead } from "@/store/types";

interface Props { messages: Message[]; lead: Lead; }

export default function CallConvo({ messages, lead }: Props) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(35);

  const transcript = messages.filter((m) => m.meta?.type === "transcript" || !m.meta?.type);

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: "var(--color-bg)" }}>
      {/* Call summary card */}
      <div
        className="rounded-[14px] p-4 mb-3 border"
        style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[15px] font-semibold">{lead.fullName}</div>
            <div className="text-[12px] mt-0.5" style={{ color: "var(--color-text3)" }}>
              {lead.company} · {lead.phone}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase shadow-sm border border-black/5 bg-emerald-50 text-emerald-600 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#22c97a" }} />
            Completed
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { val: "3:12", label: "Duration" },
            { val: "Today", label: "Date" },
            { val: "Positive", label: "Sentiment", color: "#22c97a" },
          ].map(({ val, label, color }) => (
            <div key={label} className="rounded-[10px] p-2.5 text-center" style={{ background: "var(--color-bg4)" }}>
              <div className="text-[16px] font-semibold font-mono" style={{ color: color ?? "var(--color-text)" }}>{val}</div>
              <div className="text-[10.5px] mt-0.5" style={{ color: "var(--color-text3)" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Providers */}
      <div className="flex gap-2.5 mb-3">
        {[
          { Icon: IconPhone,       bg: "rgba(245,166,35,0.1)",  color: "#f5a623", name: "Vapi.ai",     sub: "Call provider" },
          { Icon: IconMicrophone,  bg: "rgba(204,153,255,0.1)", color: "#cc99ff", name: "ElevenLabs",  sub: "Voice provider" },
        ].map(({ Icon, bg, color, name, sub }) => (
          <div key={name} className="flex-1 flex items-center gap-2 p-2.5 rounded-[10px] border" style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}>
            <div className="w-7 h-7 rounded-[7px] flex items-center justify-center flex-shrink-0" style={{ background: bg, color }}>
              <Icon size={13} />
            </div>
            <div>
              <div className="text-[12px] font-medium">{name}</div>
              <div className="text-[11px]" style={{ color: "var(--color-text3)" }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Audio player */}
      <div
        className="flex items-center gap-2.5 p-3 rounded-[10px] mb-3 border"
        style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}
      >
        <button
          onClick={() => setPlaying((p) => !p)}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ background: "#6c63ff", color: "#fff" }}
        >
          {playing ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
        </button>
        <div
          className="flex-1 h-1 rounded-full overflow-hidden cursor-pointer"
          style={{ background: "var(--color-bg4)" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setProgress(Math.round(((e.clientX - rect.left) / rect.width) * 100));
          }}
        >
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#6c63ff" }} />
        </div>
        <span className="text-[11.5px] font-mono whitespace-nowrap" style={{ color: "var(--color-text3)" }}>
          1:07 / 3:12
        </span>
      </div>

      {/* Transcript */}
      <div className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--color-text3)" }}>
        Call transcript
      </div>

      {transcript.length === 0 && (
        <p className="text-[12px] text-center mt-4" style={{ color: "var(--color-text3)" }}>No transcript available</p>
      )}

      {transcript.map((msg, i) => (
        <div key={i} className={`flex flex-col mb-2.5 ${msg.role === "agent" ? "items-end" : "items-start"}`}>
          <div
            className="max-w-[82%] px-3.5 py-2.5 rounded-xl text-[12.5px] leading-[1.55] border"
            style={
              msg.role === "agent"
                ? { background: "rgba(108,99,255,0.12)", color: "var(--color-accent2)", borderColor: "rgba(108,99,255,0.2)" }
                : { background: "var(--color-bg3)", color: "var(--color-text)", borderColor: "rgba(0,0,0,0.1)" }
            }
          >
            {msg.content}
          </div>
          <span className="text-[10.5px] mt-1" style={{ color: "var(--color-text3)" }}>
            {msg.role === "agent" ? "Agent" : lead.fullName}
          </span>
        </div>
      ))}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconKeyboard, IconMicrophone, IconPhoneOff, IconSend, IconX, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { usePracticeCall } from "@/hooks/usePracticeCall";

interface Props {
  leadId: string | null;
  leadName: string;
  onClose: () => void;
}

/**
 * Talk (or type) to the real AI agent exactly as a phone call to this lead
 * would go — same greeting, pitch and lead history — without dialing anyone.
 */
export default function PracticeCallModal({ leadId, leadName, onClose }: Props) {
  const activeAgent = useAppStore((s) => s.activeAgent);
  const call = usePracticeCall(activeAgent?._id, leadId);
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [text, setText] = useState("");
  const [showBrief, setShowBrief] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [call.turns.length]);

  function close() {
    call.end();
    onClose();
  }

  const live = call.status === "live";

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-[min(620px,100%)] flex-col overflow-hidden rounded-2xl border border-bg4 bg-bg2 shadow-xl">
        <div className="flex items-start gap-3 border-b border-bg4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-text">Practice call — {leadName}</p>
            <p className="text-[12px] leading-relaxed text-text3">
              The real AI agent of <b>{activeAgent?.name}</b>, briefed exactly as a phone call to this lead. Nobody is dialed.
              Uses ElevenLabs credits (about 1,000 per minute). Use headphones for voice.
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="text-text3"><IconX size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {call.status === "idle" && (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-text2">How do you want to play the lead?</p>
              <div className="grid grid-cols-2 gap-2">
                {([["voice", IconMicrophone, "Talk", "Speak like the lead would on the phone"], ["text", IconKeyboard, "Type", "Type your replies, hear the agent"]] as const).map(([m, Icon, title, sub]) => (
                  <button key={m} onClick={() => setMode(m)} className="rounded-xl border p-3 text-left"
                    style={{ borderColor: mode === m ? "var(--color-primary-light)" : "var(--color-bg4)", background: mode === m ? "var(--color-primary-subtle)" : "transparent" }}>
                    <Icon size={18} className="mb-1 text-text2" />
                    <p className="text-[13px] font-semibold text-text">{title}</p>
                    <p className="text-[11.5px] text-text3">{sub}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => call.start(mode)} className="rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                Start practice call
              </button>
            </div>
          )}

          {call.status === "connecting" && <p className="text-[12.5px] text-text3">Connecting to the agent…</p>}

          {call.error && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">{call.error}</p>}

          {call.turns.length > 0 && (
            <div className="flex flex-col gap-2">
              {call.turns.map((t, i) => (
                t.role === "system"
                  ? <p key={i} className="text-center text-[11.5px] italic text-text3">{t.text}</p>
                  : (
                    <div key={i} className={`flex ${t.role === "you" ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed"
                        style={{ background: t.role === "you" ? "var(--color-primary-subtle)" : "var(--color-bg3)", color: "var(--color-text)" }}>
                        <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-text3">{t.role === "you" ? `You (as ${leadName})` : "Agent"}</p>
                        {t.text}
                      </div>
                    </div>
                  )
              ))}
              <div ref={bottom} />
            </div>
          )}

          {call.preview && (
            <div className="mt-4 rounded-xl border border-bg4">
              <button onClick={() => setShowBrief((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-semibold text-text2">
                What the agent was told for this call
                {showBrief ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              </button>
              {showBrief && (
                <div className="border-t border-bg4 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text3">Opening line</p>
                  <p className="mb-2 text-[12.5px] text-text">{call.preview.greeting}</p>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text3">Instructions</p>
                  <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-text2">{call.preview.prompt}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {(live || call.status === "ended") && (
          <div className="flex items-center gap-2 border-t border-bg4 px-4 py-3">
            {live ? (
              <>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold" style={{ color: call.agentSpeaking ? "#10b981" : "var(--color-text3)" }}>
                  <span className={`h-2 w-2 rounded-full ${call.agentSpeaking ? "animate-pulse" : ""}`} style={{ background: call.agentSpeaking ? "#10b981" : "var(--color-text4)" }} />
                  {call.agentSpeaking ? "Agent speaking" : mode === "voice" ? "Listening…" : "Your turn"}
                </span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { call.sendText(text); setText(""); } }}
                  placeholder={mode === "voice" ? "…or type a reply" : "Type what the lead says"}
                  className="form-input min-w-0 flex-1 py-2 text-[13px]"
                />
                <button onClick={() => { call.sendText(text); setText(""); }} disabled={!text.trim()} aria-label="Send" className="text-text2 disabled:opacity-40"><IconSend size={17} /></button>
                <button onClick={call.end} className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-2 text-[12.5px] font-semibold text-white">
                  <IconPhoneOff size={14} /> End
                </button>
              </>
            ) : (
              <button onClick={() => call.start(mode)} className="ml-auto rounded-lg px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                Practice again
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

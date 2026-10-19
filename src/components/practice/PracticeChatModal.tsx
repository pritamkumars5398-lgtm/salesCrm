"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBrandWhatsapp, IconLoader2, IconMail, IconMessage, IconRefresh, IconSend, IconX } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";

type Channel = "email" | "whatsapp" | "sms";

interface Turn {
  role: "agent" | "lead";
  text: string;
  subject?: string | null;
  /** what would happen for real after this AI message */
  note?: string;
}

interface Props {
  leadId: string;
  leadName: string;
  channel: Channel;
  onClose: () => void;
}

const META: Record<Channel, { label: string; Icon: React.ElementType; color: string }> = {
  whatsapp: { label: "WhatsApp", Icon: IconBrandWhatsapp, color: "#22c97a" },
  email: { label: "Email", Icon: IconMail, color: "#4dabf7" },
  sms: { label: "SMS", Icon: IconMessage, color: "#cc99ff" },
};

const QUICK_REPLIES = ["Interested, tell me more", "What's the price?", "Send details please", "Not interested", "Call me tomorrow"];

/**
 * Practice a text conversation with the AI as this lead. Uses the same writers
 * as real outreach and auto-replies; nothing is sent or saved.
 */
export default function PracticeChatModal({ leadId, leadName, channel, onClose }: Props) {
  const activeAgent = useAppStore((s) => s.activeAgent);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const meta = META[channel];

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [turns.length, busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ask(mode: "opening" | "reply", history: Turn[]) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/practice/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, channel, mode, turns: history.map(({ role, text }) => ({ role, text })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The AI couldn't reply.");
      const notes: string[] = [];
      if (data.status === "closed") notes.push("For real, the lead would be marked Closed (not interested).");
      if (data.fields && Object.keys(data.fields).length) {
        notes.push(`AI would fill: ${Object.entries(data.fields).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ")}`);
      }
      setTurns([...history, { role: "agent", text: data.body, subject: data.subject, note: notes.join(" ") || undefined }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI couldn't reply.");
    } finally {
      setBusy(false);
    }
  }

  function send(message: string) {
    const clean = message.trim();
    if (!clean || busy) return;
    const next = [...turns, { role: "lead" as const, text: clean }];
    setTurns(next);
    setText("");
    ask("reply", next);
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-[min(720px,90vh)] w-[min(620px,100%)] flex-col overflow-hidden rounded-2xl border border-bg4 bg-bg2 shadow-xl">
        <div className="flex items-start gap-3 border-b border-bg4 px-5 py-4">
          <meta.Icon size={20} style={{ color: meta.color, marginTop: 2 }} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-text">Practice {meta.label} — {leadName}</p>
            <p className="text-[12px] leading-relaxed text-text3">
              You play the lead; the AI of <b>{activeAgent?.name}</b> answers exactly as it would for real (same playbook, knowledge
              and this lead&apos;s history). Nothing is sent or saved.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text3"><IconX size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {turns.length === 0 && !busy && (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] text-text2">How should it start?</p>
              <button onClick={() => ask("opening", [])} className="rounded-xl border border-bg4 p-3 text-left hover:bg-bg3">
                <p className="text-[13px] font-semibold text-text">Show the AI&apos;s first message</p>
                <p className="text-[11.5px] text-text3">The {meta.label === "Email" ? "cold email" : "first message"} it would send this lead, then you reply as them.</p>
              </button>
              <p className="mt-2 text-[12px] text-text3">…or type the lead&apos;s message below to see how the AI answers it.</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "lead" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed"
                  style={{ background: t.role === "lead" ? "var(--color-primary-subtle)" : "var(--color-bg3)", color: "var(--color-text)" }}>
                  <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-text3">{t.role === "lead" ? `${leadName} (you)` : "AI agent"}</p>
                  {t.subject && <p className="mb-1 font-semibold">Subject: {t.subject}</p>}
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  {t.note && <p className="mt-1.5 border-t border-bg4 pt-1 text-[11px] italic text-text3">{t.note}</p>}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-[12px] text-text3"><IconLoader2 size={14} className="animate-spin" /> AI is writing…</div>
            )}
            {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">{error}</p>}
            <div ref={bottom} />
          </div>
        </div>

        <div className="border-t border-bg4 px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_REPLIES.map((q) => (
              <button key={q} onClick={() => send(q)} disabled={busy} className="rounded-full border border-bg4 px-2.5 py-1 text-[11.5px] text-text2 hover:bg-bg3 disabled:opacity-50">{q}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(text); }}
              placeholder={`Type what ${leadName} replies…`}
              className="form-input min-w-0 flex-1 py-2 text-[13px]"
              autoFocus
            />
            <button onClick={() => send(text)} disabled={busy || !text.trim()} aria-label="Send" className="text-text2 disabled:opacity-40"><IconSend size={18} /></button>
            {turns.length > 0 && (
              <button onClick={() => { setTurns([]); setError(""); }} title="Start over" className="text-text3"><IconRefresh size={17} /></button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import {
  IconPhone, IconPhoneCall, IconPhoneOff, IconMicrophone, IconBrandWhatsapp, IconChevronDown, IconChevronRight, IconAlertTriangle, IconLoader2,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead, CallRecord, CallStatus } from "@/store/types";
import { formatDateTime } from "@/lib/utils/date";
import LiveListenButton from "./LiveListenButton";
import PracticeCallModal from "@/components/voice/PracticeCallModal";

interface Props {
  lead: Lead;
  /** bumped by the drawer whenever the server pushes an update for this lead */
  refreshKey: number;
  /** called after a call was successfully dispatched */
  onCallStarted?: () => void;
}

export const ACTIVE_CALL_STATUSES: CallStatus[] = ["queued", "ringing", "in_progress"];
const ACTIVE = ACTIVE_CALL_STATUSES;

export const CALL_STATUS_META: Record<CallStatus, { label: string; color: string; bg: string }> = {
  queued:      { label: "Dialing",     color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
  // Plivo's "ring" event means the phone network is trying the number — not
  // that the handset is actually ringing (blocked/DND/switched-off phones report it too).
  ringing:     { label: "Connecting",  color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
  in_progress: { label: "Live",        color: "#22c97a", bg: "rgba(34,201,122,0.14)" },
  completed:   { label: "Completed",   color: "#22c97a", bg: "rgba(34,201,122,0.12)" },
  no_answer:   { label: "No answer",   color: "#94a3b8", bg: "rgba(148,163,184,0.14)" },
  busy:        { label: "Busy",        color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
  canceled:    { label: "Canceled",    color: "#94a3b8", bg: "rgba(148,163,184,0.14)" },
  failed:      { label: "Failed",      color: "#ff6b6b", bg: "rgba(255,107,107,0.12)" },
  voicemail:   { label: "Voicemail",   color: "#cc99ff", bg: "rgba(204,153,255,0.12)" },
  logged:      { label: "Manual call", color: "#4dabf7", bg: "rgba(77,171,247,0.12)" },
};

/** Plivo hangup causes in plain words, with what to do about them. */
function explainHangup(cause: string): string {
  const c = cause.toLowerCase();
  if (c.includes("reject")) return "The phone network rejected the call — the number may be switched off, out of coverage, on DND, or blocking unknown / business numbers (call-blocking apps like Truecaller do this too). The phone never rang.";
  if (c.includes("busy")) return "The line was busy.";
  if (c.includes("no answer") || c.includes("timeout")) return "It rang but nobody picked up.";
  if (c.includes("cancel")) return "Cancelled before it was answered.";
  if (c.includes("unallocated") || c.includes("invalid") || c.includes("not exist")) return "This number doesn't exist — check it.";
  if (c.includes("unreachable") || c.includes("network")) return "The number couldn't be reached by the phone network.";
  if (c.includes("machine")) return "An answering machine / voicemail picked up.";
  return cause;
}

const SENTIMENT_COLOR: Record<string, string> = { positive: "#22c97a", neutral: "var(--color-text2)", negative: "#ff6b6b" };

/** Older transcripts saved ElevenLabs' "..." (silence) as if it were speech. */
function isSpokenTurn(t: { content: string }) {
  return !/^[\s.…,!?-]*$/.test(t.content);
}

/** ElevenLabs expressive models put delivery cues like "[smiling]" in the transcript — not spoken words. */
function stripVoiceTags(text: string) {
  return text.replace(/\[[a-z][a-z\s-]{1,24}\]\s*/gi, "").trim() || text;
}

export function fmtDuration(sec?: number) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export default function CallConvo({ lead, refreshKey, onCallStarted }: Props) {
  const { showToast, updateLead } = useAppStore();
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [practicing, setPracticing] = useState(false);

  const activeCall = calls?.find((c) => ACTIVE.includes(c.status));
  const now = useNow(!!activeCall);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${lead._id}/calls`);
      if (!res.ok) throw new Error();
      setCalls(await res.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [lead._id]);

  useEffect(() => { setCalls(null); setExpanded({}); }, [lead._id]);
  useEffect(() => { load(); }, [load, refreshKey]);

  // Server-sent events drive updates; poll as a fallback while a call is live.
  useEffect(() => {
    if (!activeCall) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [activeCall?._id, load]);

  async function startCall() {
    if (dialing || activeCall || !lead.phone) return;
    setDialing(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ai_call" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to place call");
      if (data.lead) updateLead(lead._id, data.lead);
      showToast(`📞 Calling ${lead.fullName}…`, "success");
      await load();
      onCallStarted?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to place call", "error");
    } finally {
      setDialing(false);
    }
  }

  async function endCall(call: CallRecord) {
    if (ending) return;
    const ringing = call.status !== "in_progress";
    if (!confirm(ringing ? `Cancel the call to ${lead.fullName}?` : `Hang up the call with ${lead.fullName} now?`)) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/voice/hangup?callId=${call._id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't end the call");
      showToast(ringing ? "Call canceled" : "Call ended", "success");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't end the call", "error");
    } finally {
      setEnding(false);
    }
  }

  const latestId = calls?.[0]?._id;
  const isOpen = (c: CallRecord) => expanded[c._id] ?? c._id === latestId;

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: "var(--color-bg)" }}>
      {/* Header: who we're calling + call action */}
      <div className="rounded-[14px] p-4 mb-3 border" style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold truncate">{lead.fullName}</div>
            <div className="text-[12px] mt-0.5 truncate" style={{ color: "var(--color-text3)" }}>
              {[lead.company, lead.phone].filter(Boolean).join(" · ") || "No phone number"}
            </div>
          </div>
          <button
            onClick={startCall}
            disabled={dialing || !!activeCall || !lead.phone}
            className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-white flex-shrink-0 transition-all"
            style={{
              background: dialing || activeCall || !lead.phone ? "var(--color-bg4)" : "linear-gradient(135deg,#22c97a,#10b981)",
              cursor: dialing ? "wait" : activeCall || !lead.phone ? "not-allowed" : "pointer",
            }}
            title={activeCall ? "A call is already in progress" : "Call with the AI voice agent (Plivo + ElevenLabs)"}
          >
            {dialing ? <IconLoader2 size={14} className="animate-spin" /> : <IconPhoneCall size={14} />}
            {dialing ? "Dialing…" : activeCall ? "On a call" : "Call now"}
          </button>
          <button
            onClick={() => setPracticing(true)}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-bg4 px-3 py-1.5 text-[12px] font-semibold text-text2 flex-shrink-0 hover:bg-bg3"
            title="Talk or type with the AI agent as this lead — nobody is dialed"
          >
            <IconMicrophone size={14} /> Practice
          </button>
        </div>
        {practicing && <PracticeCallModal leadId={lead._id} leadName={lead.fullName || lead.company || "this lead"} onClose={() => setPracticing(false)} />}

        {activeCall && (
          <div className="mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: CALL_STATUS_META[activeCall.status].bg }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: CALL_STATUS_META[activeCall.status].color }} />
            <span className="text-[12.5px] font-semibold" style={{ color: CALL_STATUS_META[activeCall.status].color }}>
              {activeCall.status === "in_progress"
                ? `Live · ${fmtDuration(activeCall.answeredAt ? (now - new Date(activeCall.answeredAt).getTime()) / 1000 : 0)}`
                : activeCall.status === "ringing"
                  ? `Connecting… waiting for +${activeCall.to} to pick up`
                  : `${CALL_STATUS_META[activeCall.status].label}… +${activeCall.to}`}
            </span>
            {activeCall.mode === "ai" && (
              <div className="ml-auto flex items-center gap-1.5">
                {/* audio starts flowing once the lead picks up */}
                <LiveListenButton key={activeCall._id} callId={activeCall._id} live={!!activeCall} />
                <button
                  onClick={() => endCall(activeCall)}
                  disabled={ending}
                  className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[11.5px] font-semibold text-white transition-all"
                  style={{ background: ending ? "var(--color-bg4)" : "#e5484d", cursor: ending ? "wait" : "pointer" }}
                  title={activeCall.status === "in_progress" ? "Hang up this call now" : "Cancel this call before it's answered"}
                >
                  {ending ? <IconLoader2 size={13} className="animate-spin" /> : <IconPhoneOff size={13} />}
                  {activeCall.status === "in_progress" ? "End call" : "Cancel"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Providers */}
      <div className="flex gap-2.5 mb-4">
        {[
          { Icon: IconPhone, bg: "rgba(59,130,246,0.1)", color: "#3b82f6", name: "Plivo", sub: "Telephony provider" },
          { Icon: IconMicrophone, bg: "rgba(204,153,255,0.1)", color: "#cc99ff", name: "ElevenLabs", sub: "Conversational AI" },
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

      <div className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--color-text3)" }}>
        Call history{calls && calls.length > 0 ? ` · ${calls.length}` : ""}
      </div>

      {calls === null && !loadError && (
        <p className="text-[12px] text-center mt-4" style={{ color: "var(--color-text3)" }}>Loading calls…</p>
      )}
      {loadError && calls === null && (
        <p className="text-[12px] text-center mt-4" style={{ color: "#ff6b6b" }}>Couldn&apos;t load calls. <button className="underline" onClick={load}>Retry</button></p>
      )}
      {calls?.length === 0 && (
        <p className="text-[12px] text-center mt-4" style={{ color: "var(--color-text3)" }}>No calls yet</p>
      )}

      {calls?.map((c) => {
        const meta = CALL_STATUS_META[c.status] ?? CALL_STATUS_META.failed;
        const open = isOpen(c);
        const live = ACTIVE.includes(c.status);
        const duration = c.status === "in_progress" && c.answeredAt
          ? (now - new Date(c.answeredAt).getTime()) / 1000
          : c.durationSec;
        return (
          <div key={c._id} className="rounded-[12px] border mb-2.5 overflow-hidden" style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}>
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
              onClick={() => setExpanded((e) => ({ ...e, [c._id]: !open }))}
            >
              {open ? <IconChevronDown size={14} style={{ color: "var(--color-text3)" }} /> : <IconChevronRight size={14} style={{ color: "var(--color-text3)" }} />}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ background: meta.bg, color: meta.color }}>
                <span className={`w-1.5 h-1.5 rounded-full ${live ? "animate-pulse" : ""}`} style={{ background: meta.color }} />
                {meta.label}
              </span>
              <span className="text-[11.5px] flex-1 truncate" style={{ color: "var(--color-text3)" }}>
                {formatDateTime(c.createdAt)}{c.mode === "ai" ? " · AI agent" : ""}
              </span>
              {(c.status === "completed" || c.status === "in_progress") && (
                <span className="text-[12px] font-mono" style={{ color: "var(--color-text)" }}>{fmtDuration(duration)}</span>
              )}
            </button>

            {open && (
              <div className="px-3 pb-3">
                {(c.status === "completed" || c.sentiment || c.outcome) && (
                  <div className="grid grid-cols-3 gap-2 mb-2.5">
                    {[
                      { val: fmtDuration(duration), label: "Duration" },
                      { val: c.sentiment ? c.sentiment[0].toUpperCase() + c.sentiment.slice(1) : "—", label: "Sentiment", color: c.sentiment ? SENTIMENT_COLOR[c.sentiment] : undefined },
                      { val: c.outcome ? c.outcome.replace(/_/g, " ") : "—", label: "Outcome" },
                    ].map(({ val, label, color }) => (
                      <div key={label} className="rounded-[10px] p-2 text-center" style={{ background: "var(--color-bg4)" }}>
                        <div className="text-[13px] font-semibold capitalize truncate" style={{ color: color ?? "var(--color-text)" }}>{val}</div>
                        <div className="text-[10.5px] mt-0.5" style={{ color: "var(--color-text3)" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {c.summary && (
                  <p className="text-[12.5px] leading-[1.55] mb-2.5" style={{ color: "var(--color-text2)" }}>{c.summary}</p>
                )}

                {c.whatsappSentAt ? (
                  <div className="flex items-center gap-1.5 text-[11.5px] mb-2" style={{ color: "#22c97a" }}>
                    <IconBrandWhatsapp size={13} /> WhatsApp details sent to the lead ({formatDateTime(c.whatsappSentAt)})
                  </div>
                ) : c.whatsappError ? (
                  <div className="flex items-start gap-1.5 text-[11.5px] mb-2" style={{ color: "#f5a623" }}>
                    <IconBrandWhatsapp size={13} className="flex-shrink-0 mt-[1px]" /> WhatsApp details not sent: {c.whatsappError}
                  </div>
                ) : null}

                {c.endedByUser && !live && (
                  <p className="text-[11.5px] mb-2" style={{ color: "var(--color-text3)" }}>You ended this call from the CRM.</p>
                )}

                {!live && c.hangupCause && c.status !== "completed" && !c.endedByUser && (
                  <p className="text-[11.5px] mb-2" style={{ color: "var(--color-text3)" }}>{explainHangup(c.hangupCause)}</p>
                )}

                {c.error && (
                  <div className="flex items-start gap-1.5 rounded-[8px] px-2.5 py-2 mb-2.5 text-[11.5px]" style={{ background: "rgba(255,107,107,0.08)", color: "#ff6b6b" }}>
                    <IconAlertTriangle size={13} className="flex-shrink-0 mt-[1px]" />
                    <span>{c.error}</span>
                  </div>
                )}

                {c.recordingUrl && (
                  <audio controls preload="none" src={c.recordingUrl} className="w-full mb-2.5" style={{ height: 34 }} />
                )}

                {c.transcript?.some(isSpokenTurn) ? (
                  <div className="mt-1">
                    {c.transcript.filter(isSpokenTurn).map((t, i) => (
                      <div key={i} className={`flex flex-col mb-2 ${t.role === "agent" ? "items-end" : "items-start"}`}>
                        <div
                          className="max-w-[85%] px-3 py-2 rounded-xl text-[12.5px] leading-[1.5] border"
                          style={
                            t.role === "agent"
                              ? { background: "rgba(223,42,42,0.12)", color: "var(--color-accent2)", borderColor: "rgba(223,42,42,0.2)" }
                              : { background: "var(--color-bg)", color: "var(--color-text)", borderColor: "rgba(0,0,0,0.1)" }
                          }
                        >
                          {stripVoiceTags(t.content)}
                        </div>
                        <span className="text-[10.5px] mt-0.5" style={{ color: "var(--color-text3)" }}>
                          {t.role === "agent" ? "Agent" : lead.fullName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  c.mode === "ai" && (
                    <p className="text-[12px]" style={{ color: "var(--color-text3)" }}>
                      {live ? "Transcript will appear here as the conversation happens." : "No transcript for this call."}
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

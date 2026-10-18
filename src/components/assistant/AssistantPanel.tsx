"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  IconSparkles, IconX, IconSend, IconLoader2, IconTrash, IconCircleCheck, IconAlertTriangle, IconShieldCheck, IconBrain,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";

/**
 * ClickUp-Brain-style assistant: chat with the CRM and it reads/changes settings,
 * sequences, schedules, and runs calls/campaigns through /api/assistant.
 * Actions that contact leads or change automation come back as a Confirm card.
 */

interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning?: string;
}
interface Pending { toolCallId: string; name: string; summary: string }
/** What's happening right now, streamed from the server while a turn runs. */
interface LiveStep {
  key: string;
  kind: "status" | "reasoning" | "tool";
  text: string;
  state: "running" | "ok" | "error";
}

const TOOL_LABELS: Record<string, string> = {
  get_setup_status: "Checked your setup",
  get_settings: "Read settings",
  update_settings: "Updated settings",
  voice_setup: "Checked voice call setup",
  get_sequence: "Read the sequence",
  set_sequence: "Updated the sequence",
  find_leads: "Searched leads",
  get_activity_summary: "Pulled results",
  list_schedules: "Read schedules",
  create_schedule: "Created a schedule",
  toggle_schedule: "Updated a schedule",
  set_agent_status: "Changed agent status",
  call_lead: "Started a call",
  test_call: "Started a test call",
  start_campaign: "Started outreach",
  add_lead: "Added a lead",
  update_lead: "Updated a lead",
  add_lead_note: "Added a note",
  delete_lead: "Moved a lead to Trash",
};

/** Present-tense labels while a tool is running. */
const TOOL_RUNNING: Record<string, string> = {
  get_setup_status: "Checking your setup…",
  get_settings: "Reading settings…",
  update_settings: "Saving settings…",
  voice_setup: "Checking ElevenLabs…",
  get_sequence: "Reading the sequence…",
  set_sequence: "Saving the sequence…",
  find_leads: "Searching leads…",
  get_activity_summary: "Pulling results…",
  list_schedules: "Reading schedules…",
  create_schedule: "Creating the schedule…",
  toggle_schedule: "Updating the schedule…",
  set_agent_status: "Updating agent status…",
  call_lead: "Dialing…",
  test_call: "Dialing…",
  start_campaign: "Starting outreach…",
  add_lead: "Adding the lead…",
  update_lead: "Updating the lead…",
  add_lead_note: "Adding the note…",
  delete_lead: "Moving to Trash…",
};

const SUGGESTIONS = [
  "What's set up and what's missing?",
  "Set up AI voice calls for me",
  "Make my sequence call-only",
  "How are my calls going?",
  "Calls should be in Hindi, 2 at a time",
  "Start outreach to 10 new leads",
  "Add 9876543210 as Ramesh Gupta",
];

const storageKey = (agentId: string) => `ai_assistant_${agentId}`;

function loadChat(agentId: string): { messages: ChatMessage[]; pending: Pending | null } {
  try {
    const raw = localStorage.getItem(storageKey(agentId));
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return { messages: [], pending: null };
}

function saveChat(agentId: string, messages: ChatMessage[], pending: Pending | null) {
  try {
    localStorage.setItem(storageKey(agentId), JSON.stringify({ messages: messages.slice(-60), pending }));
  } catch { /* storage unavailable */ }
}

/** Minimal markdown: **bold**, `code`, bullet / numbered lines. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith("`") && p.endsWith("`") ? <code key={i} className="px-1 rounded text-[11.5px]" style={{ background: "var(--color-bg4)" }}>{p.slice(1, -1)}</code>
    : <Fragment key={i}>{p}</Fragment>
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, i) => {
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
        if (bullet) return <div key={i} className="flex gap-1.5 pl-1"><span style={{ color: "var(--color-text3)" }}>•</span><span>{renderInline(bullet[1])}</span></div>;
        if (numbered) return <div key={i} className="flex gap-1.5 pl-1"><span style={{ color: "var(--color-text3)" }}>{numbered[1]}.</span><span>{renderInline(numbered[2])}</span></div>;
        if (/^#{1,4}\s/.test(line)) return <div key={i} className="font-semibold mt-1">{renderInline(line.replace(/^#{1,4}\s/, ""))}</div>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <div key={i}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

export default function AssistantPanel() {
  const { activeAgent, assistantOpen, setAssistantOpen, updateAgent } = useAppStore();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const page = pathname.split("/")[1] || "dashboard";
  const agentId = activeAgent?._id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStep[]>([]);
  const [openThoughts, setOpenThoughts] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Per-agent chat history (kept in this browser only).
  useEffect(() => {
    if (!agentId) return;
    const saved = loadChat(agentId);
    setMessages(saved.messages);
    setPending(saved.pending);
    setError(null);
  }, [agentId]);

  useEffect(() => { if (agentId) saveChat(agentId, messages, pending); }, [agentId, messages, pending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, busy, live]);

  // ⌘J / Ctrl+J toggles the panel; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAssistantOpen(!useAppStore.getState().assistantOpen);
      } else if (e.key === "Escape" && useAppStore.getState().assistantOpen) {
        setAssistantOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setAssistantOpen]);

  useEffect(() => { if (assistantOpen) setTimeout(() => inputRef.current?.focus(), 150); }, [assistantOpen]);

  async function applyChanges(changes: string[]) {
    if (!changes.length) return;
    queryClient.invalidateQueries();
    window.dispatchEvent(new CustomEvent("crm:data-changed", { detail: { changes } }));
    if (changes.includes("agent") && agentId) {
      const res = await fetch(`/api/agents/${agentId}`).catch(() => null);
      if (res?.ok) {
        const agent = await res.json();
        if (agent?.status) updateAgent(agentId, { status: agent.status, name: agent.name });
      }
    }
  }

  function onLiveEvent(e: { type: string; text?: string; id?: string; name?: string; ok?: boolean; note?: string }) {
    setLive((steps) => {
      // only the latest status line stays "running"
      const settled = steps.map((st) => (st.kind === "status" && st.state === "running" ? { ...st, state: "ok" as const } : st));
      if (e.type === "status") return [...settled, { key: `s${settled.length}`, kind: "status", text: e.text || "Thinking…", state: "running" }];
      if (e.type === "reasoning") return [...settled, { key: `r${settled.length}`, kind: "reasoning", text: e.text || "", state: "ok" }];
      if (e.type === "tool_start") return [...settled, { key: e.id!, kind: "tool", text: TOOL_RUNNING[e.name!] ?? `Running ${e.name}…`, state: "running" }];
      if (e.type === "tool_end") {
        return settled.map((st) => st.key === e.id
          ? { ...st, state: e.ok ? "ok" : "error", text: `${TOOL_LABELS[e.name!] ?? e.name}${e.note ? ` — ${e.note}` : ""}` }
          : st);
      }
      return settled;
    });
  }

  async function send(history: ChatMessage[], confirm?: { toolCallId: string; approved: boolean }) {
    if (!agentId) return;
    setBusy(true);
    setError(null);
    setLive([{ key: "s0", kind: "status", text: confirm ? (confirm.approved ? "Running it…" : "Cancelling…") : "Thinking…", state: "running" }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, messages: history, page, confirm, stream: true }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "The assistant couldn't respond");
      }
      // NDJSON: progress events, then a final "done" (or "error").
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: { messages?: ChatMessage[]; pending?: Pending | null; changes?: string[] } | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "done") final = event;
          else if (event.type === "error") throw new Error(event.error || "The assistant couldn't respond");
          else onLiveEvent(event);
        }
      }
      if (!final) throw new Error("The assistant stopped before answering — try again.");
      setMessages(final.messages ?? history);
      setPending(final.pending ?? null);
      await applyChanges(final.changes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant couldn't respond");
    } finally {
      setBusy(false);
      setLive([]);
    }
  }

  function submit(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput("");
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    setPending(null); // typing a new message skips an unanswered confirmation
    send(history);
  }

  function respond(approved: boolean) {
    if (!pending || busy) return;
    const p = pending;
    setPending(null);
    send(messages, { toolCallId: p.toolCallId, approved });
  }

  function clearChat() {
    setMessages([]);
    setPending(null);
    setError(null);
  }

  // Tool results by call id, for the activity rows under assistant messages.
  const toolResults = useMemo(() => {
    const map = new Map<string, { ok: boolean; note?: string }>();
    for (const m of messages) {
      if (m.role !== "tool" || !m.tool_call_id) continue;
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(m.content || "null"); } catch { /* not JSON */ }
      const err = parsed && typeof parsed === "object" && "error" in parsed ? String(parsed.error) : undefined;
      const declined = !!(parsed && typeof parsed === "object" && ("declined" in parsed || "skipped" in parsed));
      map.set(m.tool_call_id, { ok: !err && !declined, note: err ?? (declined ? "cancelled" : undefined) });
    }
    return map;
  }, [messages]);

  if (!activeAgent) return null;

  return (
    <>
      {/* backdrop on small screens */}
      {assistantOpen && <div className="fixed inset-0 z-[90] md:hidden" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setAssistantOpen(false)} />}

      <aside
        className="fixed top-0 right-0 h-full z-[95] flex flex-col border-l transition-transform duration-300"
        style={{
          width: "min(440px, 100vw)",
          background: "var(--color-bg2)",
          borderColor: "var(--color-bg4)",
          transform: assistantOpen ? "translateX(0)" : "translateX(100%)",
          boxShadow: assistantOpen ? "-12px 0 40px rgba(0,0,0,0.35)" : "none",
        }}
        aria-hidden={!assistantOpen}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--color-bg4)" }}>
          <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: "linear-gradient(135deg,#8b5cf6,#6c63ff)" }}>
            <IconSparkles size={16} color="#fff" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">AI Assistant</div>
            <div className="text-[11px] truncate" style={{ color: "var(--color-text3)" }}>Set up & run {activeAgent.name} by chat</div>
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat} title="Clear chat" className="p-1.5 rounded-md" style={{ color: "var(--color-text3)" }}>
              <IconTrash size={15} />
            </button>
          )}
          <button onClick={() => setAssistantOpen(false)} title="Close (Esc)" className="p-1.5 rounded-md" style={{ color: "var(--color-text3)" }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center pt-6">
              <span className="flex items-center justify-center rounded-2xl mb-3" style={{ width: 52, height: 52, background: "rgba(139,92,246,0.14)" }}>
                <IconSparkles size={24} style={{ color: "#a78bfa" }} />
              </span>
              <div className="text-[14px] font-semibold">What should we set up?</div>
              <p className="text-[12px] mt-1 max-w-[300px]" style={{ color: "var(--color-text3)" }}>
                Ask in plain words — I can check and change settings, voice calls, sequences and schedules, find leads, and start calls or outreach (you confirm those first).
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="text-[11.5px] px-2.5 py-1.5 rounded-full border"
                    style={{ borderColor: "var(--color-bg4)", background: "var(--color-bg3)", color: "var(--color-text2)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "tool") return null;
            if (m.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md text-[12.5px] leading-[1.5] whitespace-pre-wrap" style={{ background: "linear-gradient(135deg,#8b5cf6,#6c63ff)", color: "#fff" }}>
                    {m.content}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex flex-col gap-1.5">
                {m.reasoning && (
                  <div>
                    <button
                      onClick={() => setOpenThoughts((o) => ({ ...o, [i]: !o[i] }))}
                      className="flex items-center gap-1 text-[11px]"
                      style={{ color: "var(--color-text3)" }}
                    >
                      <IconBrain size={12} /> {openThoughts[i] ? "Hide thought process" : "Thought process"}
                    </button>
                    {openThoughts[i] && (
                      <div className="mt-1 pl-3 border-l text-[11.5px] leading-[1.5] whitespace-pre-wrap" style={{ borderColor: "var(--color-bg4)", color: "var(--color-text3)" }}>
                        {m.reasoning}
                      </div>
                    )}
                  </div>
                )}
                {m.tool_calls?.map((c) => {
                  const r = toolResults.get(c.id);
                  const awaiting = pending?.toolCallId === c.id;
                  return (
                    <div key={c.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: r?.ok ? "var(--color-text3)" : r ? "#ff6b6b" : "var(--color-text3)" }}>
                      {r ? (r.ok ? <IconCircleCheck size={13} style={{ color: "#22c97a" }} /> : <IconAlertTriangle size={13} />) : awaiting ? <IconShieldCheck size={13} style={{ color: "#a78bfa" }} /> : <IconLoader2 size={13} className="animate-spin" />}
                      <span>{TOOL_LABELS[c.function.name] ?? c.function.name}{awaiting ? " — waiting for your OK" : r?.note ? ` — ${r.note}` : ""}</span>
                    </div>
                  );
                })}
                {m.content && (
                  <div className="max-w-[95%] text-[12.5px] leading-[1.55]" style={{ color: "var(--color-text)" }}>
                    <Markdown text={m.content} />
                  </div>
                )}
              </div>
            );
          })}

          {pending && (
            <div className="rounded-xl border p-3" style={{ borderColor: "rgba(139,92,246,0.4)", background: "rgba(139,92,246,0.08)" }}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#a78bfa" }}>
                <IconShieldCheck size={13} /> Confirm action
              </div>
              <div className="text-[12.5px] leading-[1.5] mb-2.5"><Markdown text={pending.summary} /></div>
              <div className="flex gap-2">
                <button
                  onClick={() => respond(true)}
                  disabled={busy}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-md text-white"
                  style={{ background: "linear-gradient(135deg,#22c97a,#10b981)" }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => respond(false)}
                  disabled={busy}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-md"
                  style={{ background: "var(--color-bg3)", color: "var(--color-text2)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {busy && (
            <div className="flex flex-col gap-1.5">
              {live.map((st) =>
                st.kind === "reasoning" ? (
                  <div key={st.key} className="flex gap-1.5 text-[11.5px] leading-[1.5] pl-0.5" style={{ color: "var(--color-text3)" }}>
                    <IconBrain size={13} className="flex-shrink-0 mt-[2px]" />
                    <span className="italic whitespace-pre-wrap">{st.text.length > 500 ? `…${st.text.slice(-500)}` : st.text}</span>
                  </div>
                ) : (
                  <div key={st.key} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: st.state === "error" ? "#ff6b6b" : "var(--color-text3)" }}>
                    {st.state === "running" ? <IconLoader2 size={13} className="animate-spin" style={{ color: "#a78bfa" }} />
                      : st.state === "ok" ? <IconCircleCheck size={13} style={{ color: "#22c97a" }} />
                      : <IconAlertTriangle size={13} />}
                    <span>{st.text}</span>
                  </div>
                )
              )}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-1.5 text-[12px] rounded-lg px-3 py-2" style={{ background: "rgba(255,107,107,0.08)", color: "#ff6b6b" }}>
              <IconAlertTriangle size={14} className="flex-shrink-0 mt-[1px]" /> {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t p-3 flex-shrink-0" style={{ borderColor: "var(--color-bg4)" }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={pending ? "Confirm above, or type to do something else…" : "Ask or tell me what to set up…"}
              rows={1}
              className="flex-1 rounded-xl px-3 py-2 text-[12.5px] outline-none resize-none border"
              style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)", minHeight: 38, maxHeight: 120 }}
            />
            <button
              onClick={() => submit()}
              disabled={busy || !input.trim()}
              className="w-[38px] h-[38px] rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: busy || !input.trim() ? "var(--color-bg4)" : "linear-gradient(135deg,#8b5cf6,#6c63ff)", color: "#fff" }}
              title="Send (Enter)"
            >
              {busy ? <IconLoader2 size={15} className="animate-spin" /> : <IconSend size={15} />}
            </button>
          </div>
          <div className="text-[10.5px] mt-1.5" style={{ color: "var(--color-text3)" }}>
            Pasted API keys are saved to Settings and masked in this chat. Calls, outreach and automation changes need your Confirm.
          </div>
        </div>
      </aside>
    </>
  );
}

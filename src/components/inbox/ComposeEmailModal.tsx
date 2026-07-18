"use client";
import { useMemo, useState } from "react";
import { IconX, IconMail, IconSend } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead } from "@/store/types";

interface Props {
  leads: Lead[];
  agentId: string;
  onClose: () => void;
  onSent: (lead: Lead) => void;
}

export default function ComposeEmailModal({ leads, agentId, onClose, onSent }: Props) {
  const { showToast, setConversations } = useAppStore();
  const [query, setQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const filteredLeads = useMemo(() => {
    if (!query.trim()) return leads.slice(0, 30);
    const q = query.toLowerCase();
    return leads.filter((l) => l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)).slice(0, 30);
  }, [leads, query]);

  async function handleSend() {
    if (!selectedLead || !subject.trim() || !body.trim() || sending) return;
    setSending(true);
    const content = `Subject: ${subject.trim()}\n\n${body.trim()}`;
    try {
      const convoRes = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selectedLead._id, agentId, channel: "email", role: "agent", content }),
      });
      if (convoRes.ok) {
        const convo = await convoRes.json();
        setConversations(selectedLead._id, [convo]);
      }

      const emailRes = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, to: selectedLead.email, subject: subject.trim(), body: body.trim() }),
      });
      const data = await emailRes.json();
      if (!emailRes.ok) {
        showToast(data.error ?? "Failed to send email", "error");
      } else {
        showToast(`Email sent to ${selectedLead.email}`);
        onSent(selectedLead);
      }
    } catch {
      showToast("Failed to send email", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div
        className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: 520, maxWidth: "92vw", maxHeight: "82vh", background: "var(--color-bg2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: "var(--color-bg4)" }}>
          <IconMail size={16} style={{ color: "#4dabf7" }} />
          <span className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>New message</span>
          <button onClick={onClose} className="ml-auto p-1 rounded-md border-none bg-transparent cursor-pointer" style={{ color: "var(--color-text3)" }}>
            <IconX size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5 p-4 overflow-y-auto">
          {/* To field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold" style={{ color: "var(--color-text2)" }}>To</label>
            {selectedLead ? (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 border" style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)" }}>
                <span className="text-[12.5px] font-medium flex-1 truncate" style={{ color: "var(--color-text)" }}>
                  {selectedLead.fullName} <span style={{ color: "var(--color-text3)" }}>&lt;{selectedLead.email}&gt;</span>
                </span>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="border-none bg-transparent cursor-pointer p-0.5"
                  style={{ color: "var(--color-text3)" }}
                >
                  <IconX size={13} />
                </button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search leads by name, email or company..."
                  className="w-full text-[12.5px] rounded-lg px-3 py-2 outline-none border"
                  style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)" }}
                />
                <div className="flex flex-col rounded-lg border overflow-hidden max-h-[160px] overflow-y-auto" style={{ borderColor: "var(--color-bg4)" }}>
                  {filteredLeads.length === 0 ? (
                    <div className="px-3 py-2.5 text-[11.5px]" style={{ color: "var(--color-text3)" }}>No matching leads with an email address</div>
                  ) : (
                    filteredLeads.map((l) => (
                      <button
                        key={l._id}
                        onClick={() => { setSelectedLead(l); setQuery(""); }}
                        className="flex flex-col items-start text-left px-3 py-2 border-none cursor-pointer transition-colors"
                        style={{ background: "var(--color-bg2)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg3)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-bg2)")}
                      >
                        <span className="text-[12.5px] font-medium" style={{ color: "var(--color-text)" }}>{l.fullName}</span>
                        <span className="text-[11px]" style={{ color: "var(--color-text3)" }}>{l.email}{l.company ? ` · ${l.company}` : ""}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full text-[13px] rounded-lg px-3 py-2 outline-none border"
            style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)" }}
          />

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={8}
            className="w-full text-[12.5px] rounded-lg px-3 py-2.5 outline-none border resize-none"
            style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)", lineHeight: 1.6 }}
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0" style={{ borderColor: "var(--color-bg4)" }}>
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-[12.5px] font-medium border cursor-pointer"
            style={{ background: "transparent", borderColor: "var(--color-bg4)", color: "var(--color-text2)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!selectedLead || !subject.trim() || !body.trim() || sending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12.5px] font-semibold text-white border-none"
            style={{
              background: (!selectedLead || !subject.trim() || !body.trim() || sending) ? "var(--color-bg4)" : "linear-gradient(135deg, #4f46e5, #6366f1)",
              cursor: (!selectedLead || !subject.trim() || !body.trim() || sending) ? "not-allowed" : "pointer",
            }}
          >
            <IconSend size={13} /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState, useRef } from "react";
import {
  IconX, IconRobot, IconBrandWhatsapp, IconMail, IconMessage, IconPhone, IconSend,
  IconAlertCircle, IconCalendarCheck,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Channel } from "@/store/types";
import Avatar from "@/components/ui/Avatar";
import WAConvo from "./WAConvo";
import EmailConvo from "./EmailConvo";
import SMSConvo from "./SMSConvo";
import CallConvo from "./CallConvo";

const CHANNEL_TABS: { id: Channel; label: string; Icon: React.ElementType; color: string }[] = [
  { id: "whatsapp", label: "WhatsApp", Icon: IconBrandWhatsapp, color: "#22c97a" },
  { id: "email",    label: "Email",    Icon: IconMail,          color: "#4dabf7" },
  { id: "sms",      label: "SMS",      Icon: IconMessage,       color: "#cc99ff" },
  { id: "call",     label: "Call",     Icon: IconPhone,         color: "#f5a623" },
];

const REPLY_HINTS: Record<Channel, { icon: React.ElementType; color: string; label: string }> = {
  whatsapp: { icon: IconBrandWhatsapp, color: "#22c97a", label: "Sending via WhatsApp" },
  email:    { icon: IconMail,          color: "#4dabf7", label: "Sending via Email" },
  sms:      { icon: IconMessage,       color: "#cc99ff", label: "Sending via SMS" },
  call:     { icon: IconPhone,         color: "#f5a623", label: "Voice call — send follow-up text" },
};

export default function ConversationDrawer() {
  const {
    drawer, closeDrawer, setDrawerChannel,
    conversations, setConversations, appendMessage,
    updateLead, activeAgent, showToast,
  } = useAppStore();

  const { open, lead, channel } = drawer;
  const [agentOn, setAgentOn] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || !lead) return;
    setAgentOn(lead.agentEnabled);
    // Load conversations for this lead
    fetch(`/api/conversations?leadId=${lead._id}`)
      .then((r) => r.json())
      .then((data) => setConversations(lead._id, data))
      .catch(() => {});
  }, [open, lead?._id]);

  async function toggleAgent(checked: boolean) {
    if (!lead || !activeAgent) return;
    setAgentOn(checked);
    await fetch(`/api/leads/${lead._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentEnabled: checked }),
    });
    updateLead(lead._id, { agentEnabled: checked });
    if (!checked) updateLead(lead._id, { status: "in_outreach" });
  }

  async function markAsBooked() {
    if (!lead || marking) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}/mark-booked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      updateLead(lead._id, { status: "meeting_booked" });
      showToast(`✅ Meeting booked for ${lead.fullName}!`, "success");
    } catch {
      showToast("Failed to mark as booked", "error");
    } finally {
      setMarking(false);
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !lead || !activeAgent || sending) return;
    const content = replyText.trim();
    setReplyText("");
    setSending(true);

    appendMessage(lead._id, channel, {
      role: "agent",
      content,
      timestamp: new Date().toISOString(),
    });

    try {
      // Save to conversation history
      await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId:  lead._id,
          agentId: activeAgent._id,
          channel,
          role:    "agent",
          content,
        }),
      });

      // Actually send if email channel and lead has an email address
      if (channel === "email") {
        if (!lead.email) {
          showToast("Lead has no email address", "error");
        } else {
          const subject = emailSubject.trim() || `Hi ${lead.fullName.split(" ")[0]}, a message for you`;
          const res = await fetch("/api/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: activeAgent._id,
              to:      lead.email,
              subject,
              body:    content,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error ?? "Email send failed", "error");
          } else {
            showToast(`Email sent to ${lead.email}`);
          }
        }
      } else {
        showToast("Message saved");
      }
    } catch {
      showToast("Failed to send", "error");
    } finally {
      setSending(false);
    }
  }

  const convos = lead ? (conversations[lead._id] ?? []) : [];
  const currentConvo = convos.find((c) => c.channel === channel);
  const hint = REPLY_HINTS[channel];

  return (
    <div
      className="flex flex-col flex-shrink-0 border-l overflow-hidden transition-all duration-300"
      style={{
        width: open ? 480 : 0,
        minWidth: open ? 480 : 0,
        background: "var(--color-bg2)",
        borderColor: "rgba(0,0,0,0.1)",
      }}
    >
      {open && lead && (
        <>
          {/* Topbar */}
          <div
            className="flex items-center gap-2.5 px-4 py-3.5 flex-shrink-0 border-b"
            style={{ borderColor: "rgba(0,0,0,0.1)" }}
          >
            <Avatar name={lead.fullName} size={34} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold truncate">{lead.fullName}</div>
              <div className="text-[12px] truncate" style={{ color: "var(--color-text3)" }}>
                {lead.company}
              </div>
            </div>
            {lead.status === "replied" && (
              <button
                onClick={markAsBooked}
                disabled={marking}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold text-white whitespace-nowrap transition-all duration-150 hover:brightness-105 flex-shrink-0"
                style={{ padding: "5px 10px", background: marking ? "#9ca3af" : "linear-gradient(135deg,#22c97a,#10b981)", cursor: marking ? "wait" : "pointer" }}
              >
                <IconCalendarCheck size={13} />
                {marking ? "Booking..." : "Mark Booked"}
              </button>
            )}
            <button
              onClick={closeDrawer}
              className="p-1 rounded-md transition-colors"
              style={{ color: "var(--color-text3)" }}
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Agent toggle */}
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
            style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}
          >
            <div className="flex items-center gap-2 text-[12.5px]">
              <IconRobot size={15} style={{ color: agentOn ? "#22c97a" : "#ff6b6b" }} />
              <span style={{ color: agentOn ? "#22c97a" : "#ff6b6b", fontWeight: 500 }}>
                {agentOn ? "Agent active" : "Agent paused"}
              </span>
              <span style={{ color: "var(--color-text3)", fontSize: 12 }}>
                {agentOn ? "— handling this lead" : "— you are in control"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-mono" style={{ color: agentOn ? "#22c97a" : "#ff6b6b" }}>
                {agentOn ? "ON" : "OFF"}
              </span>
              <label className="relative w-11 h-6 shrink-0">
                <input
                  type="checkbox"
                  checked={agentOn}
                  onChange={(e) => toggleAgent(e.target.checked)}
                />
                <div className="absolute inset-0 bg-slate-300 rounded-full cursor-pointer transition-colors duration-300 ease-in-out border border-black/5 shadow-inner peer-checked:bg-emerald-500 peer-checked:border-transparent before:content-[''] before:absolute before:w-[18px] before:h-[18px] before:left-[2px] before:top-[2px] before:bg-white before:rounded-full before:transition-transform before:duration-300 before:ease-in-out before:shadow-sm peer-checked:before:translate-x-[20px]" />
              </label>
            </div>
          </div>

          {/* Channel tabs */}
          <div
            className="flex flex-shrink-0 border-b"
            style={{ background: "var(--color-bg2)", borderColor: "rgba(0,0,0,0.1)" }}
          >
            {CHANNEL_TABS.map(({ id, label, Icon, color }) => (
              <button
                key={id}
                onClick={() => setDrawerChannel(id)}
                className="flex-1 py-2.5 text-[12px] font-medium flex items-center justify-center gap-1.5 border-b-2 transition-all duration-150"
                style={{
                  color: channel === id ? "var(--color-text)" : "var(--color-text3)",
                  borderBottomColor: channel === id ? "#6c63ff" : "transparent",
                  background: channel === id ? "var(--color-bg3)" : "transparent",
                }}
              >
                <Icon size={15} style={{ color: channel === id ? color : undefined }} />
                {label}
              </button>
            ))}
          </div>

          {/* Conversation body */}
          <div className="flex-1 overflow-hidden">
            {channel === "whatsapp" && <WAConvo messages={currentConvo?.messages ?? []} lead={lead} />}
            {channel === "email"    && <EmailConvo messages={currentConvo?.messages ?? []} lead={lead} />}
            {channel === "sms"      && <SMSConvo messages={currentConvo?.messages ?? []} lead={lead} />}
            {channel === "call"     && <CallConvo messages={currentConvo?.messages ?? []} lead={lead} />}
          </div>

          {/* Reply box */}
          <div
            className="flex-shrink-0 border-t p-3"
            style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--color-bg2)" }}
          >
            {!agentOn && (
              <div
                className="flex items-center gap-2 rounded-[10px] px-3.5 py-2.5 mb-2.5 text-[12.5px] border border-dashed"
                style={{ background: "rgba(255,107,107,0.06)", borderColor: "rgba(255,107,107,0.25)", color: "#ff6b6b" }}
              >
                <IconAlertCircle size={15} />
                Agent paused — you are replying manually
              </div>
            )}
            {channel === "email" && (
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject line..."
                className="w-full rounded-[10px] px-3 py-2 text-[12.5px] outline-none border mb-2"
                style={{
                  background: "var(--color-bg3)",
                  borderColor: "rgba(0,0,0,0.1)",
                  color: "var(--color-text)",
                }}
              />
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder={channel === "call" ? "Send a follow-up text..." : "Type a message..."}
                rows={1}
                className="flex-1 rounded-[10px] px-3 py-2.5 text-[13px] outline-none resize-none border transition-colors duration-150 font-[family-name:var(--font-sans)]"
                style={{
                  background: "var(--color-bg3)",
                  borderColor: "rgba(0,0,0,0.1)",
                  color: "var(--color-text)",
                  minHeight: 40,
                  maxHeight: 100,
                }}
              />
              <button
                onClick={sendReply}
                disabled={sending}
                className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: sending ? "var(--color-bg4)" : "#6c63ff", color: "#fff", cursor: sending ? "wait" : "pointer" }}
              >
                <IconSend size={16} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11.5px]" style={{ color: "var(--color-text3)" }}>
              <hint.icon size={14} style={{ color: hint.color }} />
              {hint.label}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

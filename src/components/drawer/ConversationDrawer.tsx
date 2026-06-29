"use client";
import { useEffect, useState, useRef } from "react";
import {
  IconX, IconRobot, IconBrandWhatsapp, IconMail, IconMessage, IconPhone, IconSend,
  IconAlertCircle, IconCalendarCheck, IconRefresh,
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
  const [sendAs, setSendAs] = useState<"agent" | "lead">("agent");
  const [syncing, setSyncing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!lead) return;
    setAgentOn(lead.agentEnabled);
    setSendAs("agent");
  }, [lead?._id]);

  // Real-time Server-Sent Events (SSE) connection
  useEffect(() => {
    if (!open || !lead) return;

    const loadData = () => {
      fetch(`/api/conversations?leadId=${lead._id}`)
        .then((r) => r.json())
        .then((data) => setConversations(lead._id, data))
        .catch(() => {});

      fetch(`/api/leads/${lead._id}`)
        .then((r) => r.json())
        .then((data) => updateLead(lead._id, data))
        .catch(() => {});
    };

    // Load data initially
    loadData();

    // Connect to Server-Sent Events
    const eventSource = new EventSource(`/api/conversations/events?leadId=${lead._id}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "message") {
          loadData();
        }
      } catch (err) {
        console.error("SSE parsing error:", err);
      }
    };

    eventSource.onerror = () => {
      console.warn("SSE connection lost. Retrying connection...");
    };

    return () => {
      eventSource.close();
    };
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

  async function syncEmails() {
    if (!lead || syncing) return;
    setSyncing(true);
    showToast("Checking Gmail inbox for replies...");
    try {
      const res = await fetch(`/api/conversations/sync?leadId=${lead._id}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to sync inbox", "error");
      } else {
        if (data.count > 0) {
          showToast(`Synced! Found ${data.count} new reply email(s).`, "success");
          
          // Fetch updated standard conversation document list
          const convoRes = await fetch(`/api/conversations?leadId=${lead._id}`);
          if (convoRes.ok) {
            const updatedConvos = await convoRes.json();
            setConversations(lead._id, updatedConvos);
          }

          // Fetch updated lead details to sync UI status badge
          const leadRes = await fetch(`/api/leads/${lead._id}`);
          if (leadRes.ok) {
            const updatedLead = await leadRes.json();
            updateLead(lead._id, updatedLead);
          }
        } else {
          showToast("Inbox checked. No new replies.");
        }
      }
    } catch {
      showToast("Inbox sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !lead || !activeAgent || sending) return;
    const content = replyText.trim();
    const role = sendAs;
    const subject = emailSubject.trim();

    setReplyText("");
    if (channel === "email") {
      setEmailSubject("");
    }
    setSending(true);

    const savedContent = (channel === "email" && subject)
      ? `Subject: ${subject}\n\n${content}`
      : content;

    appendMessage(lead._id, channel, {
      role,
      content: savedContent,
      timestamp: new Date().toISOString(),
    });

    try {
      // Save to conversation history
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId:  lead._id,
          agentId: activeAgent._id,
          channel,
          role,
          content: savedContent,
        }),
      });

      if (res.ok) {
        // Fetch updated conversations
        const convoRes = await fetch(`/api/conversations?leadId=${lead._id}`);
        if (convoRes.ok) {
          const updatedConvos = await convoRes.json();
          setConversations(lead._id, updatedConvos);
        }

        // Fetch updated lead info (e.g. status)
        const leadRes = await fetch(`/api/leads/${lead._id}`);
        if (leadRes.ok) {
          const updatedLead = await leadRes.json();
          updateLead(lead._id, updatedLead);
        }
      }

      // Actually send if email channel and lead has an email address, and role is agent
      if (role === "agent" && channel === "email") {
        if (!lead.email) {
          showToast("Lead has no email address", "error");
        } else {
          const finalSubject = subject || `Hi ${lead.fullName.split(" ")[0]}, a message for you`;
          const emailSendRes = await fetch("/api/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: activeAgent._id,
              to:      lead.email,
              subject: finalSubject,
              body:    content,
            }),
          });
          const data = await emailSendRes.json();
          if (!emailSendRes.ok) {
            showToast(data.error ?? "Email send failed", "error");
          } else {
            showToast(`Email sent to ${lead.email}`);
          }
        }
      } else if (role === "agent" && channel === "whatsapp") {
        if (!lead.phone) {
          showToast("Lead has no phone number", "error");
        } else {
          const waSendRes = await fetch("/api/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: activeAgent._id,
              to:      lead.phone,
              text:    content,
            }),
          });
          const data = await waSendRes.json();
          if (!waSendRes.ok) {
            showToast(data.error ?? "WhatsApp send failed", "error");
          } else {
            showToast(`WhatsApp message sent to ${lead.phone}`);
          }
        }
      } else {
        showToast(role === "agent" ? "Message saved" : "Client message simulated");
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
            className="flex items-center gap-2 px-4 py-2 flex-shrink-0 border-b"
            style={{ borderColor: "rgba(0,0,0,0.1)" }}
          >
            <Avatar name={lead.fullName} size={30} />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold truncate">{lead.fullName}</div>
              <div className="text-[11px] truncate" style={{ color: "var(--color-text3)" }}>
                {lead.company}
              </div>
            </div>
            {lead.status === "replied" && (
              <button
                onClick={markAsBooked}
                disabled={marking}
                className="inline-flex items-center justify-center gap-1 rounded-md text-[10.5px] font-semibold text-white whitespace-nowrap transition-all duration-150 hover:brightness-105 flex-shrink-0"
                style={{ padding: "4px 8px", background: marking ? "#9ca3af" : "linear-gradient(135deg,#22c97a,#10b981)", cursor: marking ? "wait" : "pointer" }}
              >
                <IconCalendarCheck size={11} />
                {marking ? "Booking..." : "Mark Booked"}
              </button>
            )}
            {channel === "email" && (
              <button
                onClick={syncEmails}
                disabled={syncing}
                title="Sync Gmail inbox for new replies"
                className="p-1 rounded-md transition-colors hover:bg-[var(--color-bg3)] flex items-center justify-center flex-shrink-0"
                style={{ color: "var(--color-text3)", cursor: syncing ? "wait" : "pointer" }}
              >
                <IconRefresh size={15} className={syncing ? "animate-spin" : ""} />
              </button>
            )}
            <button
              onClick={closeDrawer}
              className="p-1 rounded-md transition-colors"
              style={{ color: "var(--color-text3)" }}
            >
              <IconX size={15} />
            </button>
          </div>

          {/* Agent toggle */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
            style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}
          >
            <div className="flex items-center gap-1.5 text-[12px]">
              <IconRobot size={14} style={{ color: agentOn ? "#22c97a" : "#ff6b6b" }} />
              <span style={{ color: agentOn ? "#22c97a" : "#ff6b6b", fontWeight: 500 }}>
                {agentOn ? "Agent active" : "Agent paused"}
              </span>
              <span style={{ color: "var(--color-text3)", fontSize: 11.5 }}>
                {agentOn ? "— active" : "— manual"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono" style={{ color: agentOn ? "#22c97a" : "#ff6b6b" }}>
                {agentOn ? "ON" : "OFF"}
              </span>
              <label className="relative w-9 h-5 shrink-0">
                <input
                  type="checkbox"
                  checked={agentOn}
                  onChange={(e) => toggleAgent(e.target.checked)}
                />
                <div className="absolute inset-0 bg-slate-300 rounded-full cursor-pointer transition-colors duration-300 ease-in-out border border-black/5 shadow-inner peer-checked:bg-emerald-500 peer-checked:border-transparent before:content-[''] before:absolute before:w-[14px] before:h-[14px] before:left-[2px] before:top-[3px] before:bg-white before:rounded-full before:transition-transform before:duration-300 before:ease-in-out before:shadow-sm peer-checked:before:translate-x-[16px]" />
              </label>
            </div>
          </div>

          {/* Channel tabs */}
          <div
            className="flex flex-shrink-0 border-b"
            style={{ background: "var(--color-bg2)", borderColor: "rgba(0,0,0,0.1)" }}
          >
            {CHANNEL_TABS.map(({ id, label, Icon, color }) => {
              const needsPhone = id === "whatsapp" || id === "sms" || id === "call";
              const tabDisabled = (id === "email" && !lead.email) || (needsPhone && !lead.phone);
              return (
                <button
                  key={id}
                  onClick={() => !tabDisabled && setDrawerChannel(id)}
                  title={tabDisabled ? (id === "email" ? "No email address" : "No phone number") : undefined}
                  className="flex-1 py-2 text-[11.5px] font-medium flex items-center justify-center gap-1 border-b-2 transition-all duration-150"
                  style={{
                    color: tabDisabled ? "var(--color-text3)" : channel === id ? "var(--color-text)" : "var(--color-text3)",
                    borderBottomColor: !tabDisabled && channel === id ? "#6c63ff" : "transparent",
                    background: !tabDisabled && channel === id ? "var(--color-bg3)" : "transparent",
                    opacity: tabDisabled ? 0.35 : 1,
                    cursor: tabDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <Icon size={14} style={{ color: !tabDisabled && channel === id ? color : undefined }} />
                  {label}
                </button>
              );
            })}
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
            className="flex-shrink-0 border-t p-2.5"
            style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--color-bg2)" }}
          >
            {/* Simulation role toggle */}
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex gap-0.5 bg-[var(--color-bg3)] p-0.5 rounded-lg border border-[rgba(0,0,0,0.06)]">
                <button
                  type="button"
                  onClick={() => setSendAs("agent")}
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-150"
                  style={{
                    background: sendAs === "agent" ? "#6c63ff" : "transparent",
                    color: sendAs === "agent" ? "#fff" : "var(--color-text3)",
                  }}
                >
                  Agent
                </button>
                <button
                  type="button"
                  onClick={() => setSendAs("lead")}
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-150"
                  style={{
                    background: sendAs === "lead" ? "#10b981" : "transparent",
                    color: sendAs === "lead" ? "#fff" : "var(--color-text3)",
                  }}
                >
                  Client
                </button>
              </div>
              <span className="text-[10px] font-medium" style={{ color: "var(--color-text3)" }}>
                {sendAs === "agent" ? "Sending as Agent" : `Simulating reply from ${lead.fullName.split(" ")[0]}`}
              </span>
            </div>

            {!agentOn && sendAs === "agent" && (
              <div
                className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 mb-2 text-[11.5px] border border-dashed"
                style={{ background: "rgba(255,107,107,0.05)", borderColor: "rgba(255,107,107,0.2)", color: "#ff6b6b" }}
              >
                <IconAlertCircle size={14} />
                Agent paused — you are replying manually
              </div>
            )}
            {channel === "email" && sendAs === "agent" && (
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject line..."
                className="w-full rounded-[8px] px-3 py-1.5 text-[12px] outline-none border mb-2"
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
                placeholder={
                  sendAs === "lead"
                    ? `Reply as ${lead.fullName.split(" ")[0]}...`
                    : channel === "call"
                    ? "Send a follow-up text..."
                    : "Type a message..."
                }
                rows={1}
                className="flex-1 rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none border transition-colors duration-150 font-[family-name:var(--font-sans)]"
                style={{
                  background: "var(--color-bg3)",
                  borderColor: "rgba(0,0,0,0.1)",
                  color: "var(--color-text)",
                  minHeight: 34,
                  maxHeight: 100,
                }}
              />
              <button
                onClick={sendReply}
                disabled={sending}
                className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ 
                  background: sending ? "var(--color-bg4)" : (sendAs === "lead" ? "#10b981" : "#6c63ff"), 
                  color: "#fff", 
                  cursor: sending ? "wait" : "pointer" 
                }}
              >
                <IconSend size={14} />
              </button>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[10.5px]" style={{ color: "var(--color-text3)" }}>
              <hint.icon size={13} style={{ color: hint.color }} />
              {hint.label}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState, useRef } from "react";
import {
  IconRobot, IconBrandWhatsapp, IconMail, IconMessage, IconSend,
  IconAlertCircle, IconCalendarCheck, IconRefresh, IconLoader2, IconPaperclip, IconPhoto
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Channel, Lead } from "@/store/types";
import Avatar from "@/components/ui/Avatar";
import WAConvo from "@/components/drawer/WAConvo";
import EmailConvo from "@/components/drawer/EmailConvo";
import SMSConvo from "@/components/drawer/SMSConvo";

const REPLY_HINTS: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  whatsapp: { icon: IconBrandWhatsapp, color: "#22c97a", label: "Sending via WhatsApp" },
  email: { icon: IconMail, color: "#4dabf7", label: "Sending via Email" },
  sms: { icon: IconMessage, color: "#cc99ff", label: "Sending via SMS" },
};

interface Props {
  lead: Lead;
  channel: Channel;
  onSent?: () => void;
}

export default function ChannelConversationThread({ lead, channel, onSent }: Props) {
  const {
    conversations, setConversations, appendMessage,
    updateLead, activeAgent, showToast,
  } = useAppStore();

  const [agentOn, setAgentOn] = useState(lead.agentEnabled);
  const [replyText, setReplyText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [sendAs, setSendAs] = useState<"agent" | "lead">("agent");
  const [syncing, setSyncing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [agentTyping, setAgentTyping] = useState(false);
  const [leadTyping, setLeadTyping] = useState(false);

  const isCurrentlyTyping = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (!activeAgent || !channel) return;
    fetch(`/api/usage?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((d) => {
         const { plan, usage } = d;
         if (channel === "whatsapp" && plan.limits.messagesPerMonth !== -1 && usage.messagesSent >= plan.limits.messagesPerMonth) {
           setIsLocked(true);
         } else if (channel === "email" && plan.limits.emailsPerMonth !== -1 && usage.emailsSent >= plan.limits.emailsPerMonth) {
           setIsLocked(true);
         } else if (channel === "sms" && plan.limits.smsPerMonth !== -1 && usage.smsSent >= plan.limits.smsPerMonth) {
           setIsLocked(true);
         } else {
           setIsLocked(false);
         }
      })
      .catch(() => {});
  }, [activeAgent?._id, channel, conversations]);

  const sendTypingStatus = async (isTyping: boolean) => {
    if (!lead || !activeAgent) return;
    try {
      await fetch("/api/conversations/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead._id, role: sendAs, isTyping, by: "user" }),
      });
    } catch (err) {
      console.error("Failed to send typing status", err);
    }
  };

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("File is too large. Max size is 5MB.", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      if (channel === "email") {
        setReplyText(prev => prev + (prev ? "\n\n" : "") + data.url);
      } else {
        await sendReply(data.url);
      }
    } catch {
      showToast("Failed to upload image. Please try again.", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Reset local UI state whenever the selected lead changes
  useEffect(() => {
    setAgentOn(lead.agentEnabled);
    setSendAs("agent");
    setReplyText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setEmailSubject("");
    setAgentTyping(false);
    setLeadTyping(false);
    isCurrentlyTyping.current = false;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [lead._id]);

  // Fetch + live updates for the selected lead's thread
  useEffect(() => {
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
    loadData();

    const eventSource = new EventSource(`/api/conversations/events?leadId=${lead._id}`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "message") {
          loadData();
          onSent?.();
        } else if (data.type === "typing" && data.by !== "user") {
          if (data.role === "agent") setAgentTyping(data.isTyping);
          else if (data.role === "lead") setLeadTyping(data.isTyping);
        }
      } catch (err) {
        console.error("SSE parsing error:", err);
      }
    };
    eventSource.onerror = () => console.warn("SSE connection lost. Retrying connection...");

    return () => eventSource.close();
  }, [lead._id]);

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
      showToast(`Meeting booked for ${lead.fullName}!`, "success");
    } catch {
      showToast("Failed to mark as booked", "error");
    } finally {
      setMarking(false);
    }
  }

  async function syncEmails() {
    if (!lead || syncing) return;
    setSyncing(true);
    showToast("Checking inbox for replies...");
    try {
      const res = await fetch(`/api/conversations/sync?leadId=${lead._id}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error ?? "Failed to sync inbox", "error");
      } else if (data.count > 0) {
        showToast(`Synced! Found ${data.count} new reply email(s).`, "success");
        const convoRes = await fetch(`/api/conversations?leadId=${lead._id}`);
        if (convoRes.ok) setConversations(lead._id, await convoRes.json());
        const leadRes = await fetch(`/api/leads/${lead._id}`);
        if (leadRes.ok) updateLead(lead._id, await leadRes.json());
        onSent?.();
      } else {
        showToast("Inbox checked. No new replies.");
      }
    } catch {
      showToast("Inbox sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function sendReply(customText?: string) {
    const textToSubmit = customText || replyText;
    if (!textToSubmit.trim() || !lead || !activeAgent || sending) return;
    const content = textToSubmit.trim();
    const role = sendAs;
    const subject = emailSubject.trim();

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isCurrentlyTyping.current = false;
    sendTypingStatus(false);

    if (!customText) {
      setReplyText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
    if (channel === "email") setEmailSubject("");
    setSending(true);

    const savedContent = (channel === "email" && subject) ? `Subject: ${subject}\n\n${content}` : content;

    appendMessage(lead._id, channel, { role, content: savedContent, timestamp: new Date().toISOString() });

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead._id, agentId: activeAgent._id, channel, role, content: savedContent }),
      });

      if (res.ok) {
        const convoRes = await fetch(`/api/conversations?leadId=${lead._id}`);
        if (convoRes.ok) setConversations(lead._id, await convoRes.json());
        const leadRes = await fetch(`/api/leads/${lead._id}`);
        if (leadRes.ok) updateLead(lead._id, await leadRes.json());
        onSent?.();
      }

      if (role === "agent" && channel === "email") {
        if (!lead.email) {
          showToast("Lead has no email address", "error");
        } else {
          const finalSubject = subject || `Hi ${lead.fullName.split(" ")[0]}, a message for you`;
          const emailSendRes = await fetch("/api/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: activeAgent._id, to: lead.email, subject: finalSubject, body: content }),
          });
          const data = await emailSendRes.json();
          if (!emailSendRes.ok) showToast(data.error ?? "Email send failed", "error");
          else showToast(`Email sent to ${lead.email}`);
        }
      } else if (role === "agent" && channel === "whatsapp") {
        if (!lead.phone) {
          showToast("Lead has no phone number", "error");
        } else {
          const waSendRes = await fetch("/api/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: activeAgent._id, to: lead.phone, text: content }),
          });
          const data = await waSendRes.json();
          if (!waSendRes.ok) showToast(data.error ?? "WhatsApp send failed", "error");
          else showToast(`WhatsApp message sent to ${lead.phone}`);
        }
      } else if (role === "agent" && channel === "sms") {
        if (!lead.phone) {
          showToast("Lead has no phone number", "error");
        } else {
          const smsSendRes = await fetch("/api/sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: activeAgent._id, to: lead.phone, text: content }),
          });
          const data = await smsSendRes.json();
          if (!smsSendRes.ok) showToast(data.error ?? "SMS send failed", "error");
          else showToast(`SMS message sent to ${lead.phone}`);
        }
      }
    } catch {
      showToast("Failed to send", "error");
    } finally {
      setSending(false);
    }
  }

  const convos = conversations[lead._id] ?? [];
  const currentConvo = convos.find((c) => c.channel === channel);
  const hint = REPLY_HINTS[channel] ?? REPLY_HINTS.whatsapp;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-bg2)" }}>
      {/* Topbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0 border-b" style={{ borderColor: "var(--color-bg4)" }}>
        <Avatar name={lead.fullName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold truncate" style={{ color: "var(--color-text)" }}>{lead.fullName}</div>
          <div className="text-[11px] truncate" style={{ color: "var(--color-text3)" }}>
            {channel === "email" ? lead.email : lead.phone} {lead.company ? `· ${lead.company}` : ""}
          </div>
        </div>
        {lead.status === "replied" && (
          <button
            onClick={markAsBooked}
            disabled={marking}
            className="inline-flex items-center justify-center gap-1 rounded-md text-[10.5px] font-semibold text-white whitespace-nowrap transition-all duration-150 hover:brightness-105 flex-shrink-0"
            style={{ padding: "4px 8px", background: marking ? "#9ca3af" : "linear-gradient(135deg,#22c97a,#10b981)", cursor: marking ? "wait" : "pointer", border: "none" }}
          >
            <IconCalendarCheck size={11} />
            {marking ? "Booking..." : "Mark Booked"}
          </button>
        )}
        {channel === "email" && (
          <button
            onClick={syncEmails}
            disabled={syncing}
            title="Sync inbox for new replies"
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-bg3)] flex items-center justify-center flex-shrink-0 border-none bg-transparent"
            style={{ color: "var(--color-text3)", cursor: syncing ? "wait" : "pointer" }}
          >
            <IconRefresh size={15} className={syncing ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* Agent toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0" style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)" }}>
        <div className="flex items-center gap-1.5 text-[12px]">
          <IconRobot size={14} style={{ color: agentOn ? "#22c97a" : "#ff6b6b" }} />
          <span style={{ color: agentOn ? "#22c97a" : "#ff6b6b", fontWeight: 500 }}>{agentOn ? "Agent active" : "Agent paused"}</span>
          <span style={{ color: "var(--color-text3)", fontSize: 11.5 }}>{agentOn ? "— active" : "— manual"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono" style={{ color: agentOn ? "#22c97a" : "#ff6b6b" }}>{agentOn ? "ON" : "OFF"}</span>
          <label className="relative w-9 h-5 shrink-0">
            <input type="checkbox" className="peer sr-only" checked={agentOn} onChange={(e) => toggleAgent(e.target.checked)} />
            <div className="absolute inset-0 bg-slate-300 rounded-full cursor-pointer transition-colors duration-300 ease-in-out border border-black/5 shadow-inner peer-checked:bg-emerald-500 peer-checked:border-transparent before:content-[''] before:absolute before:w-[14px] before:h-[14px] before:left-[2px] before:top-[3px] before:bg-bg2 before:rounded-full before:transition-transform before:duration-300 before:ease-in-out before:shadow-sm peer-checked:before:translate-x-[16px]" />
          </label>
        </div>
      </div>

      {/* Conversation body */}
      <div className="flex-1 overflow-hidden">
        {channel === "whatsapp" && <WAConvo messages={currentConvo?.messages ?? []} lead={lead} agentTyping={agentTyping} leadTyping={leadTyping} />}
        {channel === "email" && <EmailConvo messages={currentConvo?.messages ?? []} lead={lead} agentTyping={agentTyping} leadTyping={leadTyping} />}
        {channel === "sms" && <SMSConvo messages={currentConvo?.messages ?? []} lead={lead} agentTyping={agentTyping} leadTyping={leadTyping} />}
      </div>

      {/* Reply box */}
      <div className="flex-shrink-0 border-t p-2.5" style={{ borderColor: "var(--color-bg4)", background: "var(--color-bg2)" }}>
        <div className="flex items-center justify-between mb-2 px-1 flex-wrap gap-2" style={{ rowGap: 8 }}>
          <div className="flex gap-0.5 bg-[var(--color-bg3)] p-0.5 rounded-lg border border-[rgba(0,0,0,0.06)]">
            <button
              type="button"
              onClick={() => setSendAs("agent")}
              className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-150 border-none cursor-pointer"
              style={{ background: sendAs === "agent" ? "#6c63ff" : "transparent", color: sendAs === "agent" ? "#fff" : "var(--color-text3)" }}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => setSendAs("lead")}
              className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-150 border-none cursor-pointer"
              style={{ background: sendAs === "lead" ? "#10b981" : "transparent", color: sendAs === "lead" ? "#fff" : "var(--color-text3)" }}
            >
              Client
            </button>
          </div>
          <span className="text-[10px] font-medium" style={{ color: "var(--color-text3)" }}>
            {sendAs === "agent" ? "Sending as Agent" : `Simulating reply from ${lead.fullName.split(" ")[0]}`}
          </span>
        </div>

        {!agentOn && sendAs === "agent" && (
          <div className="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 mb-2 text-[11.5px] border border-dashed w-full" style={{ background: "rgba(255,107,107,0.05)", borderColor: "rgba(255,107,107,0.2)", color: "#ff6b6b" }}>
            <IconAlertCircle size={14} />
            Agent paused — you are replying manually
          </div>
        )}

        {channel === "email" ? (
          <>
            {isReplying ? (
              <div className="rounded-[8px] overflow-hidden flex flex-col border shadow-sm mb-1" style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--color-bg)" }}>
              {/* To Field */}
              <div className="px-3 py-2 border-b flex items-center text-[12px]" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <span className="w-8 font-medium" style={{ color: "var(--color-text3)" }}>To</span>
                <span className="px-2 py-0.5 rounded-md text-[11.5px] border" style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.06)", color: "var(--color-text)" }}>
                  {sendAs === "agent" ? `${lead.fullName} <${lead.email || "No email"}>` : `Agent`}
                </span>
              </div>
              
              {/* Subject Field */}
              {sendAs === "agent" && (
                <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                  <input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Subject"
                    className="w-full text-[12px] outline-none font-medium bg-transparent"
                    style={{ color: "var(--color-text)" }}
                  />
                </div>
              )}
              
              {/* Body Textarea */}
              <div className="p-3">
                <textarea
                  ref={textareaRef}
                  value={replyText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReplyText(val);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                    if (!isCurrentlyTyping.current && val.trim().length > 0) {
                      isCurrentlyTyping.current = true;
                      sendTypingStatus(true);
                    }
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => {
                      isCurrentlyTyping.current = false;
                      sendTypingStatus(false);
                    }, 1500);
                  }}
                  disabled={isLocked}
                  placeholder={isLocked ? "Plan limit exceeded. Upgrade to send more emails." : (sendAs === "lead" ? "Simulate client reply..." : "Write your email here...")}
                  className={`w-full text-[12.5px] outline-none resize-none bg-transparent font-[family-name:var(--font-sans)] ${isLocked ? 'cursor-not-allowed opacity-50' : ''}`}
                  style={{ minHeight: 160, color: isLocked ? "var(--color-red)" : "var(--color-text)" }}
                />
              </div>
              
              {/* Toolbar */}
              <div className="px-3 py-2.5 flex items-center justify-between border-t" style={{ borderColor: "rgba(0,0,0,0.06)", background: "var(--color-bg2)" }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      sendReply();
                      setIsReplying(false);
                    }}
                    disabled={sending || isLocked}
                    className={`px-5 py-1.5 rounded-full text-[12px] font-bold text-white transition-all flex items-center gap-1.5 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110'}`}
                    style={{ background: isLocked ? "var(--color-red)" : "#0b57d0", cursor: (sending || isLocked) ? "wait" : "pointer", border: "none" }}
                  >
                    Send
                  </button>
                  <button
                    onClick={() => setIsReplying(false)}
                    className="px-3 py-1.5 text-[12px] font-medium border-none cursor-pointer transition-colors hover:text-gray-900"
                    style={{ background: "transparent", color: "var(--color-text3)" }}
                  >
                    Cancel
                  </button>
                </div>
              <div className="flex gap-2.5">
                <button type="button" onClick={() => showToast("Rich text formatting coming soon")} className="p-1 hover:bg-[var(--color-bg3)] rounded transition-colors bg-transparent border-none cursor-pointer" style={{ color: "var(--color-text3)" }} title="Formatting options">
                  <span className="font-serif font-bold text-[14px]">A</span>
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1 hover:bg-[var(--color-bg3)] rounded transition-colors bg-transparent border-none" style={{ color: "var(--color-text3)", cursor: uploading ? "wait" : "pointer" }} title="Attach files" disabled={uploading}>
                  <IconPaperclip size={16} />
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1 hover:bg-[var(--color-bg3)] rounded transition-colors bg-transparent border-none" style={{ color: "var(--color-text3)", cursor: uploading ? "wait" : "pointer" }} title="Insert photo" disabled={uploading}>
                  <IconPhoto size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-1">
            <button
              onClick={() => setIsReplying(true)}
              className="w-full text-left px-4 py-3 rounded-[8px] border text-[13px] transition-colors cursor-pointer hover:bg-black/5"
              style={{ background: "var(--color-bg)", borderColor: "rgba(0,0,0,0.1)", color: "var(--color-text3)" }}
            >
              Reply to {lead.fullName.split(" ")[0]}...
            </button>
          </div>
        )}
        </>
      ) : (
        <div className="flex gap-2 items-end mb-1">
            <textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => {
                const val = e.target.value;
                setReplyText(val);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
                if (!isCurrentlyTyping.current && val.trim().length > 0) {
                  isCurrentlyTyping.current = true;
                  sendTypingStatus(true);
                }
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => {
                  isCurrentlyTyping.current = false;
                  sendTypingStatus(false);
                }, 1500);
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              disabled={isLocked}
              placeholder={isLocked ? "Plan limit exceeded. Upgrade to send more messages." : (sendAs === "lead" ? `Reply as ${lead.fullName.split(" ")[0]}...` : "Type a message...")}
              rows={1}
              className={`flex-1 rounded-[8px] px-3 py-2 text-[12px] outline-none resize-none border transition-colors duration-150 font-[family-name:var(--font-sans)] ${isLocked ? 'cursor-not-allowed opacity-50' : ''}`}
              style={{ background: "var(--color-bg3)", borderColor: isLocked ? "rgba(239,68,68,0.3)" : "var(--color-bg4)", color: isLocked ? "var(--color-red)" : "var(--color-text)", minHeight: 34, maxHeight: 100 }}
            />
            {channel === "whatsapp" && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || sending}
                  className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center flex-shrink-0 transition-colors border"
                  style={{ borderColor: "var(--color-bg4)", background: "var(--color-bg3)", color: "var(--color-text3)", cursor: (uploading || sending) ? "wait" : "pointer" }}
                  title="Upload image"
                >
                  {uploading ? <IconLoader2 size={15} className="animate-spin" /> : <IconPaperclip size={15} />}
                </button>

              </>
            )}
            <button
              onClick={() => sendReply()}
              disabled={sending || uploading || isLocked}
              className={`w-[34px] h-[34px] rounded-[8px] flex items-center justify-center flex-shrink-0 transition-colors border-none ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{ background: (sending || uploading || isLocked) ? "var(--color-bg4)" : (sendAs === "lead" ? "#10b981" : "#6c63ff"), color: isLocked ? "var(--color-text4)" : "#fff", cursor: (sending || uploading || isLocked) ? (isLocked ? "not-allowed" : "wait") : "pointer" }}
            >
              <IconSend size={14} />
            </button>
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
        />
        <div className="flex items-center gap-1 mt-1 text-[10.5px]" style={{ color: "var(--color-text3)" }}>
          <hint.icon size={13} style={{ color: hint.color }} />
          {hint.label}
        </div>
      </div>
    </div>
  );
}

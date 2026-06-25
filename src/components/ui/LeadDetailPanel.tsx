"use client";
import { useEffect, useState } from "react";
import {
  IconX, IconMail, IconPhone, IconBrandWhatsapp, IconMessage,
  IconPlayerPlay, IconMessageCircle, IconBuilding,
  IconBriefcase, IconUser, IconCalendar, IconLink, IconEdit,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead, Channel } from "@/store/types";
import StatusPill from "@/components/ui/Pill";

const CHANNEL_META: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  email: { label: "Email", Icon: IconMail, color: "#4dabf7", bg: "rgba(77,171,247,0.12)" },
  whatsapp: { label: "WhatsApp", Icon: IconBrandWhatsapp, color: "#22c97a", bg: "rgba(34,201,122,0.12)" },
  sms: { label: "SMS", Icon: IconMessage, color: "#cc99ff", bg: "rgba(204,153,255,0.12)" },
  call: { label: "Voice call", Icon: IconPhone, color: "#f5a623", bg: "rgba(245,166,35,0.12)" },
};

const STAGE_STEPS = ["new", "contacted", "replied", "qualified", "closed"];
const STAGE_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", replied: "Replied", qualified: "Qualified", closed: "Closed",
};

function avatarColor(name: string) {
  const colors = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#7c3aed", "#db2777", "#dc2626"];
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return colors[i];
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  background: "var(--color-bg3)",
  border: "1px solid var(--color-bg4)",
  color: "var(--color-text)",
  fontSize: 12.5,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-text3)",
  marginBottom: 5,
  display: "block",
};

interface Props {
  lead: Lead;
  onClose: () => void;
  onStartOutreach: (lead: Lead) => void;
}

export default function LeadDetailPanel({ lead, onClose, onStartOutreach }: Props) {
  const { openDrawer, updateLead, showToast } = useAppStore();
  const [visible, setVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: lead.firstName || "",
    lastName: lead.lastName || "",
    email: lead.email || "",
    phone: lead.phone || "",
    jobTitle: lead.jobTitle || "",
    company: lead.company || "",
    website: lead.website || "",
    source: lead.source || "Manual",
    status: lead.status || "new",
    pipelineStage: lead.pipelineStage || "new",
    agentEnabled: lead.agentEnabled ?? true,
    channels: lead.channels || [],
  });

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setForm({
      firstName: lead.firstName || "",
      lastName: lead.lastName || "",
      email: lead.email || "",
      phone: lead.phone || "",
      jobTitle: lead.jobTitle || "",
      company: lead.company || "",
      website: lead.website || "",
      source: lead.source || "Manual",
      status: lead.status || "new",
      pipelineStage: lead.pipelineStage || "new",
      agentEnabled: lead.agentEnabled ?? true,
      channels: lead.channels || [],
    });
    setIsEditing(false);
  }, [lead?._id]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280);
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      showToast("First name and Last name are required", "error");
      return;
    }
    setSaving(true);
    try {
      const fullName = `${form.firstName} ${form.lastName}`.trim();
      const res = await fetch(`/api/leads/${lead._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fullName }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const updatedLead = await res.json();
      updateLead(lead._id, updatedLead);
      showToast("Lead details updated successfully", "success");
      setIsEditing(false);
    } catch (err: any) {
      showToast(err.message || "Failed to update lead", "error");
    } finally {
      setSaving(false);
    }
  }

  const bg = avatarColor(lead.fullName);
  const ini = initials(lead.fullName);
  const stageIdx = STAGE_STEPS.indexOf(lead.pipelineStage ?? "new");

  function Row({ Icon, label, value, href }: { Icon: React.ElementType; label: string; value: string; href?: string }) {
    if (!value) return null;
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span
          style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: "var(--color-bg3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: 1,
          }}
        >
          <Icon size={14} style={{ color: "var(--color-text3)" }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text3)", margin: "0 0 2px" }}>
            {label}
          </p>
          {href ? (
            <a href={href} style={{ fontSize: 13, color: "#4f46e5", textDecoration: "none", wordBreak: "break-all" }}>{value}</a>
          ) : (
            <p style={{ fontSize: 13, color: "var(--color-text)", margin: 0, wordBreak: "break-all" }}>{value}</p>
          )}
        </div>
      </div>
    );
  }

  function MissingRow({ Icon, label, color }: { Icon: React.ElementType; label: string; color: string }) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `${color}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginTop: 1,
        }}>
          <Icon size={14} style={{ color }} />
        </span>
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text3)", margin: "0 0 3px" }}>
            {label}
          </p>
          <p style={{ fontSize: 12, fontWeight: 600, color, margin: "0 0 3px", opacity: 0.85 }}>
            No {label.toLowerCase()} added
          </p>
          <button
            onClick={() => setIsEditing(true)}
            style={{ fontSize: 10.5, fontWeight: 600, color: "#4f46e5", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
          >
            + Add now
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(15,23,42,0.3)",
          backdropFilter: "blur(2px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50,
          width: 400,
          background: "var(--color-bg2)",
          borderLeft: "1px solid var(--color-bg4)",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.1)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-bg4)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", margin: 0 }}>
            {isEditing ? "Edit Lead details" : "Lead details"}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "4px 8px",
                  color: "#4f46e5", display: "flex", alignItems: "center", gap: 4,
                  fontSize: 12, fontWeight: 600, borderRadius: 6
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg4)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
              >
                <IconEdit size={14} />
                Edit
              </button>
            )}
            <button
              onClick={handleClose}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--color-text3)", display: "flex", borderRadius: 6 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg4)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        {isEditing ? (
          /* Editing Form */
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                style={inputStyle}
                placeholder="First name"
              />
            </div>

            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                style={inputStyle}
                placeholder="Last name"
              />
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={inputStyle}
                placeholder="Email address"
              />
            </div>

            <div>
              <label style={labelStyle}>Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={inputStyle}
                placeholder="Phone number"
              />
            </div>

            <div>
              <label style={labelStyle}>Job Title</label>
              <input
                type="text"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                style={inputStyle}
                placeholder="Job title"
              />
            </div>

            <div>
              <label style={labelStyle}>Company</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                style={inputStyle}
                placeholder="Company name"
              />
            </div>

            <div>
              <label style={labelStyle}>Website / Business Link</label>
              <input
                type="text"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                style={inputStyle}
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label style={labelStyle}>Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as any })}
                style={inputStyle}
              >
                <option value="LinkedIn">LinkedIn</option>
                <option value="Google Maps">Google Maps</option>
                <option value="JustDial">JustDial</option>
                <option value="Manual">Manual</option>
                <option value="Apify">Apify (Google Maps)</option>
                <option value="Referral">Referral</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                style={inputStyle}
              >
                <option value="new">New</option>
                <option value="in_outreach">In Outreach</option>
                <option value="replied">Replied</option>
                <option value="meeting_booked">Meeting Booked</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Pipeline Stage</label>
              <select
                value={form.pipelineStage}
                onChange={(e) => setForm({ ...form, pipelineStage: e.target.value as any })}
                style={inputStyle}
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="qualified">Qualified</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <input
                type="checkbox"
                id="agentEnabled"
                checked={form.agentEnabled}
                onChange={(e) => setForm({ ...form, agentEnabled: e.target.checked })}
                style={{ width: 15, height: 15, cursor: "pointer" }}
              />
              <label htmlFor="agentEnabled" style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", cursor: "pointer" }}>
                AI Agent Enabled
              </label>
            </div>

            <div>
              <label style={labelStyle}>Channels</label>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                {(["email", "whatsapp", "sms", "call"] as Channel[]).map((ch) => {
                  const active = form.channels.includes(ch);
                  return (
                    <label key={ch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 500, color: "var(--color-text)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...form.channels, ch]
                            : form.channels.filter((c) => c !== ch);
                          setForm({ ...form, channels: updated as any });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      {ch.charAt(0).toUpperCase() + ch.slice(1)}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* View Details */
          <>
            {/* Identity */}
            <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid var(--color-bg4)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div
                  style={{
                    width: 54, height: 54, borderRadius: "50%",
                    background: bg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 18, fontWeight: 800,
                    flexShrink: 0, boxShadow: `0 4px 14px ${bg}44`,
                  }}
                >
                  {ini}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)", margin: "0 0 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {lead.fullName}
                  </p>
                  <p style={{ fontSize: 12.5, color: "var(--color-text3)", margin: 0 }}>
                    {[lead.jobTitle, lead.company].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>

              {/* Status + source row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <StatusPill status={lead.status} />
                <span
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99,
                    background: "var(--color-bg3)", color: "var(--color-text3)",
                    border: "1px solid var(--color-bg4)",
                  }}
                >
                  {lead.source === "Apify" ? "Apify (Google Maps)" : lead.source}
                </span>
                <span
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99,
                    background: lead.agentEnabled ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)",
                    color: lead.agentEnabled ? "#059669" : "#ef4444",
                    border: `1px solid ${lead.agentEnabled ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.15)"}`,
                  }}
                >
                  Agent {lead.agentEnabled ? "enabled" : "disabled"}
                </span>
              </div>
            </div>

            {/* Pipeline progress */}
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--color-bg4)" }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", marginBottom: 12 }}>
                Pipeline stage
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                {STAGE_STEPS.map((s, i) => {
                  const done = i <= stageIdx;
                  const current = i === stageIdx;
                  return (
                    <div key={s} style={{ display: "flex", alignItems: "center", flex: i < STAGE_STEPS.length - 1 ? 1 : 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                        <div
                          style={{
                            width: 20, height: 20, borderRadius: "50%",
                            background: done ? "#4f46e5" : "var(--color-bg4)",
                            border: current ? "2px solid #4f46e5" : "2px solid transparent",
                            boxSizing: "border-box",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: current ? "0 0 0 3px rgba(79,70,229,0.15)" : "none",
                          }}
                        >
                          {done && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: done ? "#4f46e5" : "var(--color-text3)", whiteSpace: "nowrap" }}>
                          {STAGE_LABELS[s]}
                        </span>
                      </div>
                      {i < STAGE_STEPS.length - 1 && (
                        <div
                          style={{
                            flex: 1, height: 2, marginBottom: 14,
                            background: i < stageIdx ? "#4f46e5" : "var(--color-bg4)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contact info */}
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--color-bg4)" }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", marginBottom: 14 }}>
                Contact information
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Row Icon={IconUser} label="Full name" value={lead.fullName} />
                {lead.email
                  ? <Row Icon={IconMail} label="Email" value={lead.email} href={`mailto:${lead.email}`} />
                  : <MissingRow Icon={IconMail} label="Email" color="#ff6b6b" />}
                {lead.phone
                  ? <Row Icon={IconPhone} label="Phone" value={lead.phone} href={`tel:${lead.phone}`} />
                  : <MissingRow Icon={IconPhone} label="Phone" color="#f5a623" />}
                <Row Icon={IconBriefcase} label="Job title" value={lead.jobTitle} />
                <Row Icon={IconBuilding} label="Company" value={lead.company} />
                <Row Icon={IconLink} label="Website" value={lead.website || ""} href={lead.website ? (lead.website.startsWith("http") ? lead.website : `https://${lead.website}`) : undefined} />
              </div>
            </div>

            {/* Channels */}
            {(lead.channels ?? []).length > 0 && (
              <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--color-bg4)" }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", marginBottom: 12 }}>
                  Outreach channels
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(lead.channels ?? []).map((ch) => {
                    const meta = CHANNEL_META[ch];
                    if (!meta) return null;
                    return (
                      <div
                        key={ch}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 14px", borderRadius: 10,
                          background: "var(--color-bg3)", border: "1px solid var(--color-bg4)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 28, height: 28, borderRadius: 7, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <meta.Icon size={14} style={{ color: meta.color }} />
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>{meta.label}</span>
                        </div>
                        <button
                          onClick={() => { handleClose(); openDrawer(lead, ch as Channel); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "5px 12px", borderRadius: 7,
                            background: "var(--color-bg2)", border: "1px solid var(--color-bg4)",
                            fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)",
                            cursor: "pointer",
                          }}
                        >
                          <IconMessageCircle size={12} /> View convo
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Meta */}
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--color-bg4)" }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", marginBottom: 14 }}>
                Meta
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Row Icon={IconLink} label="Source" value={lead.source === "Apify" ? "Apify (Google Maps)" : lead.source} />
                <Row Icon={IconCalendar} label="Added" value={lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""} />
              </div>
            </div>
          </>
        )}

        {/* Actions / Footer */}
        <div style={{ padding: "16px 20px", marginTop: "auto", flexShrink: 0, borderTop: "1px solid var(--color-bg4)" }}>
          {isEditing ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: "10px 20px", borderRadius: 10,
                  background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: saving ? "wait" : "pointer",
                  boxShadow: "0 4px 12px rgba(79,70,229,0.28)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setForm({
                    firstName: lead.firstName || "",
                    lastName: lead.lastName || "",
                    email: lead.email || "",
                    phone: lead.phone || "",
                    jobTitle: lead.jobTitle || "",
                    company: lead.company || "",
                    website: lead.website || "",
                    source: lead.source || "Manual",
                    status: lead.status || "new",
                    pipelineStage: lead.pipelineStage || "new",
                    agentEnabled: lead.agentEnabled ?? true,
                    channels: lead.channels || [],
                  });
                }}
                style={{
                  padding: "10px 20px", borderRadius: 10,
                  background: "var(--color-bg3)", color: "var(--color-text2)",
                  fontSize: 13, fontWeight: 600,
                  border: "1px solid var(--color-bg4)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              {lead.status === "new" && (() => {
                const noContact = !lead.email && !lead.phone;
                return (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() => { if (!noContact) { onStartOutreach(lead); handleClose(); } }}
                      disabled={noContact}
                      title={noContact ? "Add email or phone before starting outreach" : undefined}
                      style={{
                        width: "100%", padding: "11px 20px", borderRadius: 10,
                        background: noContact
                          ? "var(--color-bg3)"
                          : "linear-gradient(135deg, #4f46e5, #6366f1)",
                        color: noContact ? "var(--color-text3)" : "#fff",
                        fontSize: 13, fontWeight: 700,
                        border: noContact ? "1px solid var(--color-bg4)" : "none",
                        cursor: noContact ? "not-allowed" : "pointer",
                        boxShadow: noContact ? "none" : "0 4px 12px rgba(79,70,229,0.28)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        opacity: noContact ? 0.6 : 1,
                      }}
                    >
                      <IconPlayerPlay size={15} /> Start outreach
                    </button>
                    {noContact && (
                      <p style={{ fontSize: 11, color: "#ff6b6b", textAlign: "center", margin: "6px 0 0", fontWeight: 600 }}>
                        Add email or phone to enable outreach
                      </p>
                    )}
                  </div>
                );
              })()}
              <button
                onClick={handleClose}
                style={{
                  width: "100%", padding: "9px 20px", borderRadius: 10,
                  background: "var(--color-bg3)", color: "var(--color-text2)",
                  fontSize: 13, fontWeight: 600,
                  border: "1px solid var(--color-bg4)", cursor: "pointer",
                }}
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

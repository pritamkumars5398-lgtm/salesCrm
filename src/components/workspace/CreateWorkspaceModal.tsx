"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconX, IconCheck } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { BUSINESS_TEMPLATES } from "@/lib/constants/business-templates";
import type { Agent } from "@/store/types";

interface Props {
  onClose: () => void;
}

const fieldLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)", marginBottom: 6, display: "block" };

export default function CreateWorkspaceModal({ onClose }: Props) {
  const router = useRouter();
  const { agents, organizations, addAgent, setActiveAgent, showToast } = useAppStore();
  const adminOrgs = useMemo(() => organizations.filter((o) => o.role !== "member"), [organizations]);

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("it_services");
  const [organizationId, setOrganizationId] = useState(adminOrgs[0]?._id ?? "");
  const [copyFrom, setCopyFrom] = useState("");
  const [saving, setSaving] = useState(false);

  const copyChoices = agents.filter((a) => a.organizationId === organizationId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function create() {
    if (!name.trim()) {
      showToast("Give the workspace a name", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), templateId, organizationId, copyIntegrationsFrom: copyFrom || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not create the workspace", "error");
        return;
      }
      const workspace = data as Agent;
      addAgent(workspace);
      setActiveAgent(workspace);
      showToast(`"${workspace.name}" created — tell the AI what it sells next.`, "success");
      onClose();
      router.push(`/settings/${workspace._id}?tab=playbook`);
    } finally {
      setSaving(false);
    }
  }

  // Portal to <body>: the sidebar's backdrop-filter/transform would otherwise
  // trap this "fixed" overlay inside the sidebar's 240px column.
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "var(--color-bg2)", borderRadius: "var(--radius-xl)", border: "1px solid var(--color-bg4)", boxShadow: "var(--shadow-xl)", padding: 22 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>New workspace</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--color-text3)", lineHeight: 1.5 }}>
              One workspace per business line. Each gets its own leads, AI pitch, sequences and schedules.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text3)", padding: 4 }}>
            <IconX size={16} />
          </button>
        </div>

        <label style={fieldLabel}>Name</label>
        <input
          className="form-input"
          autoFocus
          value={name}
          maxLength={60}
          placeholder="e.g. Hotel CRM, School CRM, IT Services"
          onChange={(e) => setName(e.target.value)}
          style={{ width: "100%", marginBottom: 16 }}
        />

        {adminOrgs.length > 1 && (
          <>
            <label style={fieldLabel}>Organization</label>
            <select className="form-input" value={organizationId} onChange={(e) => { setOrganizationId(e.target.value); setCopyFrom(""); }} style={{ width: "100%", marginBottom: 16 }}>
              {adminOrgs.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
            </select>
          </>
        )}

        <label style={fieldLabel}>What kind of business is it?</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: 16 }}>
          {BUSINESS_TEMPLATES.map((t) => {
            const selected = t.id === templateId;
            return (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius-lg)", cursor: "pointer",
                  border: `1px solid ${selected ? "var(--color-primary)" : "var(--color-bg4)"}`,
                  background: selected ? "var(--color-primary-subtle)" : "var(--color-bg)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--color-text)" }}>
                  {selected && <IconCheck size={13} style={{ color: "var(--color-primary)" }} />}
                  {t.label}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "var(--color-text3)", marginTop: 3, lineHeight: 1.4 }}>{t.description}</span>
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "-8px 0 16px", lineHeight: 1.5 }}>
          The template fills in a starting AI playbook, lead fields, pipeline stage names and suggested groups. You can change all of it.
        </p>

        {copyChoices.length > 0 && (
          <>
            <label style={fieldLabel}>Copy connections from</label>
            <select className="form-input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={{ width: "100%", marginBottom: 6 }}>
              <option value="">Don&apos;t copy — set up from scratch</option>
              {copyChoices.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
            <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "0 0 16px", lineHeight: 1.5 }}>
              Copies API keys and channel setup (AI, email, WhatsApp, calls, SMS). The pitch, greeting and booking link are never copied.
            </p>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} className="rounded-lg border border-bg4 bg-bg2 px-4 py-2 text-[13px] font-semibold text-text2">Cancel</button>
          <button
            onClick={create}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-light))", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

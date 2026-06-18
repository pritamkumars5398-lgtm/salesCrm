"use client";
import { useEffect, useState, useCallback } from "react";
import {
  IconSearch, IconPlus, IconRefresh, IconMessageCircle,
  IconPlayerPlay, IconMail, IconBrandWhatsapp, IconMessage, IconPhone,
  IconCheck, IconX, IconEye, IconCalendarCheck,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead, Channel } from "@/store/types";
import StatusPill from "@/components/ui/Pill";
import Avatar from "@/components/ui/Avatar";
import LeadDetailPanel from "@/components/ui/LeadDetailPanel";

const STATUS_TABS = [
  { label: "All leads",      value: "all" },
  { label: "New",            value: "new" },
  { label: "In outreach",    value: "in_outreach" },
  { label: "Replied",        value: "replied" },
  { label: "Meeting booked", value: "meeting_booked" },
];

const CHANNEL_ICONS: Record<string, { Icon: React.ElementType; cls: string }> = {
  email:    { Icon: IconMail,           cls: "text-[#4dabf7] bg-[rgba(77,171,247,0.1)]" },
  whatsapp: { Icon: IconBrandWhatsapp,  cls: "text-[#22c97a] bg-[rgba(34,201,122,0.1)]" },
  sms:      { Icon: IconMessage,        cls: "text-[#cc99ff] bg-[rgba(204,153,255,0.1)]" },
  call:     { Icon: IconPhone,          cls: "text-[#f5a623] bg-[rgba(245,166,35,0.1)]" },
};

const SOURCE_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  "Google Maps": { label: "Google Maps",  color: "#10b981", bg: "rgba(16,185,129,0.1)",  dot: "#10b981" },
  "LinkedIn":    { label: "LinkedIn",     color: "#0a66c2", bg: "rgba(10,102,194,0.1)",  dot: "#0a66c2" },
  "JustDial":    { label: "JustDial",     color: "#f58220", bg: "rgba(245,130,32,0.1)",  dot: "#f58220" },
  "Apify":       { label: "Apify (Google Maps)", color: "#6366f1", bg: "rgba(99,102,241,0.1)", dot: "#6366f1" },
  "Manual":      { label: "Manual",       color: "#94a3b8", bg: "rgba(148,163,184,0.1)", dot: "#94a3b8" },
  "Referral":    { label: "Referral",     color: "#f43f5e", bg: "rgba(244,63,94,0.1)",   dot: "#f43f5e" },
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? { label: source, color: "var(--color-text3)", bg: "var(--color-bg3)", dot: "var(--color-text3)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 600,
      padding: "3px 8px", borderRadius: 99,
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.color}22`,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}

interface Props { onAddLead: () => void; }

export default function Leads({ onAddLead }: Props) {
  const { activeAgent, leads, setLeads, updateLead, openDrawer, showToast } = useAppStore();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailLead, setDetailLead] = useState<Lead | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!activeAgent) return;
    const params = new URLSearchParams({ agentId: activeAgent._id });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (search) params.set("q", search);
    const data = await fetch(`/api/leads?${params}`).then((r) => r.json());
    setLeads(data);
  }, [activeAgent?._id, statusFilter, sourceFilter, channelFilter, search]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function startOutreach(lead: Lead) {
    showToast(`Generating AI outreach for ${lead.firstName}...`);
    try {
      const res = await fetch(`/api/leads/${lead._id}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderName: activeAgent?.name || "our team" }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to start outreach");
      
      updateLead(lead._id, { status: "in_outreach" });
      
      if (data.emailSent) {
        showToast(`AI email sent to ${lead.fullName}!`, "success");
      } else if (data.emailError) {
        if (data.emailError.includes("Email not configured")) {
          showToast(`⚠️ Please configure your Email/SMTP in Settings first!`, "error");
        } else {
          showToast(`AI generated, but email failed: ${data.emailError}`, "error");
        }
      } else {
        showToast(`Outreach started for ${lead.fullName}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Error: ${msg}`, "error");
    }
  }

  async function markAsBooked(lead: Lead) {
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
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulkStartOutreach() {
    showToast(`Starting AI outreach for ${selected.size} leads...`);
    let errors = 0;
    const promises = Array.from(selected).map(async (id) => {
      try {
        const res = await fetch(`/api/leads/${id}/outreach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senderName: activeAgent?.name || "our team" }),
        });
        const data = await res.json();
        if (res.ok) {
           updateLead(id, { status: "in_outreach" });
           if (data.emailError) errors++;
        } else {
           errors++;
        }
      } catch (err) {
        errors++;
        console.error("Bulk outreach error for lead", id, err);
      }
    });
    
    await Promise.all(promises);
    if (errors > 0) {
      showToast(`Completed with ${errors} errors (Check Settings if email failed)`, "error");
    } else {
      showToast(`Successfully sent ${selected.size} AI emails!`, "success");
    }
    setSelected(new Set());
  }

  const primaryChannel = (lead: Lead): Channel =>
    (lead.channels?.[0] as Channel) ?? "whatsapp";

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Leads{" "}
          <span className="text-[13px] font-normal" style={{ color: "var(--color-text3)" }}>
            Manage and start outreach
          </span>
        </h1>
      </div>

      {/* Status tabs */}
      <div
        className="flex gap-1 mb-5 rounded-[14px] p-1 w-fit border"
        style={{ background: "var(--color-bg2)", borderColor: "rgba(0,0,0,0.1)" }}
      >
        {STATUS_TABS.map((tab) => {
          const count = tab.value === "all"
            ? leads.length
            : leads.filter((l) => l.status === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className="flex items-center gap-1.5 px-4 py-[7px] rounded-lg text-[12.5px] font-medium transition-colors duration-150"
              style={{
                background: statusFilter === tab.value ? "var(--color-bg4)" : "transparent",
                color: statusFilter === tab.value ? "var(--color-text)" : "var(--color-text2)",
              }}
            >
              {tab.label}
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                style={{
                  background: statusFilter === tab.value ? "rgba(108,99,255,0.12)" : "var(--color-bg)",
                  color: statusFilter === tab.value ? "var(--color-accent2)" : "var(--color-text3)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2.5 mb-4">
        <div
          className="flex items-center gap-2 px-3 py-[7px] rounded-[10px] flex-1 max-w-[280px] border transition-colors focus-within:border-[#6c63ff]"
          style={{ background: "var(--color-bg2)", borderColor: "rgba(0,0,0,0.1)" }}
        >
          <IconSearch size={15} style={{ color: "var(--color-text3)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email..."
            className="bg-transparent border-none outline-none text-[13px] w-full"
            style={{ color: "var(--color-text)" }}
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400"
          style={{ width: "auto", padding: "7px 10px" }}
        >
          <option value="all">All sources</option>
          <option value="Google Maps">Google Maps</option>
          <option value="LinkedIn">LinkedIn</option>
          <option value="JustDial">JustDial</option>
          <option value="Manual">Manual</option>
          <option value="Apify">Apify</option>
          <option value="Referral">Referral</option>
        </select>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400"
          style={{ width: "auto", padding: "7px 10px" }}
        >
          <option value="all">All channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="call">Call</option>
        </select>
        <div className="flex gap-2 ml-auto">
          <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 transition-all duration-200 ease-out hover:bg-slate-50 !px-3 !py-[7px] !text-xs !rounded-lg" onClick={onAddLead}>
            <IconPlus size={14} /> Add manually
          </button>
          <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out !px-3 !py-[7px] !text-xs !rounded-lg">
            <IconRefresh size={14} /> Sync Apify
          </button>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-[18px] py-2.5 mb-2 text-[12.5px] rounded-t-[14px] border-b"
          style={{ background: "rgba(108,99,255,0.12)", borderColor: "rgba(0,0,0,0.1)", color: "var(--color-accent2)" }}
        >
          <IconCheck size={14} />
          <span>{selected.size} lead{selected.size > 1 ? "s" : ""} selected</span>
          <div className="ml-auto flex gap-2">
            <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out !px-3 !py-[7px] !text-xs !rounded-lg whitespace-nowrap" onClick={bulkStartOutreach}>
              <IconPlayerPlay size={13} /> Start outreach
            </button>
            <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 transition-all duration-200 ease-out hover:bg-slate-50 !px-3 !py-[7px] !text-xs !rounded-lg whitespace-nowrap" onClick={() => setSelected(new Set())}>
              <IconX size={13} /> Deselect
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-[14px] overflow-x-auto border"
        style={{ background: "var(--color-bg2)", borderColor: "rgba(0,0,0,0.1)" }}
      >
        <table className="w-full border-collapse min-w-[950px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
              <th className="px-4 py-3 text-left" style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={selected.size === leads.length && leads.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(leads.map((l) => l._id)) : new Set())}
                  className="accent-[#6c63ff] cursor-pointer"
                />
              </th>
              {["Name", "Company", "Source", "Channels", "Status", "Added", "Action"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase whitespace-nowrap"
                  style={{ color: "var(--color-text3)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[12px]" style={{ color: "var(--color-text3)" }}>
                  No leads found. Add your first lead or sync Apify.
                </td>
              </tr>
            )}
            {leads.map((lead, i) => (
              <tr
                key={lead._id}
                onClick={() => openDrawer(lead, primaryChannel(lead))}
                className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                style={{
                  background: selected.has(lead._id) ? "rgba(108,99,255,0.06)" : undefined,
                  borderBottom: i < leads.length - 1 ? "1px solid rgba(0,0,0,0.1)" : "none",
                }}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(lead._id)}
                    onChange={() => toggleSelect(lead._id)}
                    className="accent-[#6c63ff] cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={lead.fullName} />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium truncate max-w-[240px]" title={lead.fullName}>{lead.fullName}</div>
                      <div className="text-[11.5px] mt-0.5 truncate max-w-[240px]" style={{ color: "var(--color-text3)" }} title={lead.jobTitle}>{lead.jobTitle}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-[13px] truncate max-w-[200px]" style={{ color: "var(--color-text2)" }} title={lead.company}>
                    {lead.company}
                  </div>
                </td>
                <td className="px-4 py-3"><SourceBadge source={lead.source} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {(lead.channels ?? []).map((ch) => {
                      const cfg = CHANNEL_ICONS[ch];
                      if (!cfg) return null;
                      return (
                        <div key={ch} className={`w-6 h-6 rounded-[6px] flex items-center justify-center ${cfg.cls}`}>
                          <cfg.Icon size={13} />
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3"><StatusPill status={lead.status} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {lead.createdAt ? (
                    <div>
                      <div className="text-[12px] font-medium" style={{ color: "var(--color-text2)" }}>
                        {new Date(lead.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text3)" }}>
                        {new Date(lead.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text3)", fontSize: 11 }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1.5 items-center flex-nowrap">
                    {lead.status === "new" && (
                      <button
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold text-white whitespace-nowrap transition-all duration-150 hover:brightness-105"
                        style={{ padding: "5px 10px", background: "linear-gradient(135deg,#4f46e5,#6366f1)", border: "none", cursor: "pointer" }}
                        onClick={() => startOutreach(lead)}
                      >
                        <IconPlayerPlay size={12} /> Start
                      </button>
                    )}
                    {lead.status === "replied" && (
                      <button
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold text-white whitespace-nowrap transition-all duration-150 hover:brightness-105"
                        style={{ padding: "5px 10px", background: "linear-gradient(135deg,#22c97a,#10b981)", border: "none", cursor: "pointer" }}
                        onClick={() => markAsBooked(lead)}
                      >
                        <IconCalendarCheck size={12} /> Mark Booked
                      </button>
                    )}
                    <button
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-all duration-150"
                      style={{ padding: "5px 10px", background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text2)", cursor: "pointer" }}
                      onClick={() => openDrawer(lead, primaryChannel(lead))}
                    >
                      <IconMessageCircle size={12} /> Convo
                    </button>
                    <button
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-all duration-150"
                      style={{ padding: "5px 10px", background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text2)", cursor: "pointer" }}
                      onClick={() => setDetailLead(lead)}
                    >
                      <IconEye size={12} /> Details
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detailLead && (
        <LeadDetailPanel
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onStartOutreach={(lead) => { startOutreach(lead); setDetailLead(null); }}
        />
      )}
    </div>
  );
}

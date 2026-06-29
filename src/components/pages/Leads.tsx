"use client";
import { useEffect, useState, useCallback } from "react";
import {
  IconSearch, IconPlus, IconRefresh, IconMessageCircle,
  IconPlayerPlay, IconCheck, IconX, IconEye, IconCalendarCheck,
  IconExternalLink, IconAlertCircle, IconTrash,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead, Channel } from "@/store/types";
import StatusPill from "@/components/ui/Pill";
import Avatar from "@/components/ui/Avatar";
import LeadDetailPanel from "@/components/ui/LeadDetailPanel";
import { STATUS_TABS, SOURCE_META } from "@/lib/constants/leads";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";

const CHANNEL_ICONS: Record<string, { Icon: React.ElementType; cls: string }> = {
  email: { Icon: CHANNEL_CONFIG.email.Icon, cls: "text-[#4dabf7] bg-[rgba(77,171,247,0.1)]" },
  whatsapp: { Icon: CHANNEL_CONFIG.whatsapp.Icon, cls: "text-[#22c97a] bg-[rgba(34,201,122,0.1)]" },
  sms: { Icon: CHANNEL_CONFIG.sms.Icon, cls: "text-[#cc99ff] bg-[rgba(204,153,255,0.1)]" },
  call: { Icon: CHANNEL_CONFIG.call.Icon, cls: "text-[#f5a623] bg-[rgba(245,166,35,0.1)]" },
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
  const { activeAgent, leads, setLeads, updateLead, openDrawer, showToast, updateAgentLeadCount } = useAppStore();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [missingContact, setMissingContact] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState("all");
  const [locations, setLocations] = useState<{ name: string; active: boolean }[]>([]);

  const fetchLeads = useCallback(async () => {
    if (!activeAgent) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ agentId: activeAgent._id });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (locationFilter !== "all") params.set("location", locationFilter);
      if (search) params.set("q", search);
      if (missingContact) params.set("missingContact", "true");
      const data = await fetch(`/api/leads?${params}`).then((r) => r.json());
      setLeads(data);
    } finally {
      setLoading(false);
    }
  }, [activeAgent?._id, statusFilter, sourceFilter, channelFilter, locationFilter, search, missingContact]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/settings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((data) => {
        const rawLocs = data.leadLocations || "";
        let locsList: { name: string; active: boolean }[] = [];
        try {
          if (rawLocs) {
            locsList = JSON.parse(rawLocs);
          } else if (data.leadLocation) {
            locsList = [{ name: data.leadLocation, active: true }];
          }
        } catch (e) {
          locsList = [];
        }
        setLocations(locsList);
      });
  }, [activeAgent?._id]);

  async function handleAddLocation(name: string) {
    if (!activeAgent) return;
    const cleanName = name.trim();
    if (!cleanName) return;
    if (locations.some((l) => l.name.toLowerCase() === cleanName.toLowerCase())) {
      showToast("Location already exists", "error");
      return;
    }
    const updated = [...locations, { name: cleanName, active: true }];
    setLocations(updated);

    const serialized = JSON.stringify(updated);
    const firstActive = updated.find(l => l.active)?.name || updated[0]?.name || "";
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeAgent._id,
          settings: {
            leadLocations: serialized,
            leadLocation: firstActive,
          },
        }),
      });
      showToast(`Scraping location "${cleanName}" added!`);
    } catch {
      showToast("Failed to save location", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <div className="text-[13px] font-semibold tracking-wide text-slate-400">Loading leads...</div>
        </div>
      </div>
    );
  }

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

      if (data.whatsappSent) {
        showToast(`WhatsApp message sent to ${lead.fullName} (no email — used WhatsApp)`, "success");
      } else if (data.whatsappError) {
        showToast(`No email — tried WhatsApp but: ${data.whatsappError}`, "error");
      } else if (data.emailSent) {
        showToast(`AI email sent to ${lead.fullName}!`, "success");
      } else if (data.emailError) {
        if (data.emailError.includes("Email not configured")) {
          showToast(`Please configure your Email/SMTP in Settings first!`, "error");
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

  async function cleanupIncomplete() {
    if (!activeAgent) return;
    if (!confirm("Delete all leads missing an email or phone number? This cannot be undone.")) return;
    const res = await fetch(`/api/leads?agentId=${activeAgent._id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      showToast(`Removed ${data.deleted} incomplete lead${data.deleted !== 1 ? "s" : ""}`, "success");
      fetchLeads();
      if (activeAgent) {
        const newCount = Math.max(0, activeAgent.leadCount - data.deleted);
        updateAgentLeadCount(activeAgent._id, newCount);
      }
    } else {
      showToast(data.error ?? "Cleanup failed", "error");
    }
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
        className="flex gap-1 mb-5 rounded-[14px] p-1 w-full md:w-fit overflow-x-auto flex-nowrap border"
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
              className="flex items-center gap-1.5 px-4 py-[7px] rounded-lg text-[12.5px] font-medium transition-colors duration-150 whitespace-nowrap"
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
      <div className="flex flex-wrap items-center gap-2.5 mb-4 w-full">
        <div
          className="flex items-center gap-2 px-3 py-[7px] rounded-[10px] w-full sm:max-w-[280px] border transition-colors focus-within:border-[#6c63ff]"
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
          className="form-input w-full sm:w-auto"
          style={{ width: "auto" }}
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
          className="form-input w-full sm:w-auto"
          style={{ width: "auto" }}
        >
          <option value="all">All channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="call">Call</option>
        </select>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="form-input w-full sm:w-auto"
          style={{ width: "auto" }}
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc.name} value={loc.name}>
              {loc.name} {!loc.active && "(Inactive)"}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
          <button
            onClick={() => setMissingContact((v) => !v)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-semibold border transition-all duration-150"
            style={{
              background: missingContact ? "rgba(255,107,107,0.1)" : "var(--color-bg2)",
              borderColor: missingContact ? "#ff6b6b" : "rgba(0,0,0,0.1)",
              color: missingContact ? "#ff6b6b" : "var(--color-text2)",
            }}
            title="Show leads missing email & phone"
          >
            <IconAlertCircle size={14} /> No contact
          </button>
          <button
            onClick={cleanupIncomplete}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-semibold border transition-all duration-150"
            style={{ background: "rgba(255,107,107,0.08)", borderColor: "rgba(255,107,107,0.3)", color: "#ff6b6b" }}
            title="Delete all leads missing email or phone"
          >
            <IconTrash size={14} /> Clean up
          </button>
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
              {["Name", "Company", "Location", "Source", "Channels", "Status", "Added", "Action"].map((h) => (
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
                <td colSpan={9} className="text-center py-12 text-[12px]" style={{ color: "var(--color-text3)" }}>
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
                      {(!lead.email || !lead.phone) && (
                        <div className="flex gap-1 mt-1">
                          {!lead.email && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                              background: "rgba(255,107,107,0.1)", color: "#ff6b6b",
                              border: "1px solid rgba(255,107,107,0.25)", whiteSpace: "nowrap",
                            }}>
                              No email
                            </span>
                          )}
                          {!lead.phone && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                              background: "rgba(245,166,35,0.1)", color: "#f5a623",
                              border: "1px solid rgba(245,166,35,0.25)", whiteSpace: "nowrap",
                            }}>
                              No phone
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-[13px] truncate max-w-[200px]" style={{ color: "var(--color-text2)" }} title={lead.company}>
                    {lead.website ? (
                      <a
                        href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline inline-flex items-center gap-1 transition-colors duration-150"
                        style={{ color: "var(--color-accent2)", fontWeight: 500 }}
                      >
                        <span className="truncate">{lead.company}</span>
                        <IconExternalLink size={12} className="opacity-70 hover:opacity-100 flex-shrink-0" />
                      </a>
                    ) : (
                      lead.company
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-[12px] font-medium text-slate-500">
                    {lead.location ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {lead.location}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">—</span>
                    )}
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
                    {lead.status === "new" && (() => {
                      const noContact = !lead.email && !lead.phone;
                      return (
                        <button
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-all duration-150"
                          style={{
                            padding: "5px 10px",
                            background: noContact ? "var(--color-bg3)" : "linear-gradient(135deg,#4f46e5,#6366f1)",
                            color: noContact ? "var(--color-text3)" : "#fff",
                            border: noContact ? "1px solid var(--color-bg4)" : "none",
                            cursor: noContact ? "not-allowed" : "pointer",
                            opacity: noContact ? 0.6 : 1,
                          }}
                          disabled={noContact}
                          title={noContact ? "No email or phone — add contact info first" : undefined}
                          onClick={() => !noContact && startOutreach(lead)}
                        >
                          <IconPlayerPlay size={12} /> Start
                        </button>
                      );
                    })()}
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

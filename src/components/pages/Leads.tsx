"use client";
import { useEffect, useState, useCallback } from "react";
import {
  IconSearch, IconPlus, IconRefresh, IconMessageCircle,
  IconPlayerPlay, IconCheck, IconX, IconEye, IconCalendarCheck,
  IconExternalLink, IconAlertCircle, IconTrash, IconRestore, IconTrashX,
  IconUsers,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead, Channel } from "@/store/types";
import StatusPill from "@/components/ui/Pill";
import Avatar from "@/components/ui/Avatar";
import LeadDetailPanel from "@/components/ui/LeadDetailPanel";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonTableRow } from "@/components/ui/Skeleton";
import { STATUS_TABS, SOURCE_META } from "@/lib/constants/leads";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";
import { startLeadOutreach, mapWithConcurrency, deleteLeads, restoreLeads, permanentlyDeleteLeads } from "@/lib/api/leads.api";
import { startManualRun } from "@/lib/api/campaigns.api";
import { ApiError } from "@/lib/api/client";

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
  const { activeAgent, leads, setLeads, updateLead, removeLeads, openDrawer, showToast, updateAgentLeadCount, activeCampaign, setActiveCampaign, setCampaignPanelOpen } = useAppStore();
  const [deleting, setDeleting] = useState(false);
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
  const [addedDateFilter, setAddedDateFilter] = useState("all");
  const [outreachFilter, setOutreachFilter] = useState("all");
  const [dateOptions, setDateOptions] = useState<{ value: string; label: string; count: number }[]>([]);
  const [runOpen, setRunOpen] = useState(false);
  const [runCount, setRunCount] = useState(15);
  const [starting, setStarting] = useState(false);
  const [sequence, setSequence] = useState<any>(null);
  const [trashView, setTrashView] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const dropdownItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: "var(--color-text)",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "background-color 0.15s",
  };

  useEffect(() => {
    if (!activeAgent) {
      setSequence(null);
      return;
    }
    fetch(`/api/sequences?agentId=${activeAgent._id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.length > 0) {
          setSequence(data[0]);
        } else {
          setSequence(null);
        }
      })
      .catch((err) => console.error("Error loading sequence in Leads page", err));
  }, [activeAgent?._id]);

  const fetchLeads = useCallback(async (background = false) => {
    if (!activeAgent) return;
    if (!background) setLoading(true);
    try {
      const params = new URLSearchParams({ agentId: activeAgent._id });
      if (trashView) params.set("trashed", "1");
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (locationFilter !== "all") params.set("location", locationFilter);
      if (addedDateFilter !== "all") params.set("addedDate", addedDateFilter);
      if (outreachFilter !== "all") params.set("outreachStatus", outreachFilter);
      if (search) params.set("q", search);
      if (missingContact) params.set("missingContact", "true");
      const data: Lead[] = await fetch(`/api/leads?${params}`).then((r) => r.json());
      setLeads(data);

      // Sync-batch options: distinct days leads were added, newest first.
      if (addedDateFilter === "all" && Array.isArray(data)) {
        const counts = new Map<string, number>();
        data.forEach((l) => {
          if (!l.createdAt) return;
          const day = new Date(l.createdAt).toLocaleDateString("en-CA"); // YYYY-MM-DD local
          counts.set(day, (counts.get(day) ?? 0) + 1);
        });
        setDateOptions(
          [...counts.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([day, count]) => ({
              value: day,
              label: new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
              count,
            }))
        );
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [activeAgent?._id, trashView, statusFilter, sourceFilter, channelFilter, locationFilter, addedDateFilter, outreachFilter, search, missingContact]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // While a run is in flight for this agent, refresh lead statuses in the
  // background so the table shows live "sending…" highlights and results.
  const campaignRunning = !!activeCampaign
    && activeCampaign.agentId === activeAgent?._id
    && (activeCampaign.status === "pending" || activeCampaign.status === "running");

  useEffect(() => {
    if (!campaignRunning) return;
    const t = setInterval(() => fetchLeads(true), 3000);
    return () => { clearInterval(t); fetchLeads(true); };
  }, [campaignRunning, fetchLeads]);

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

  // loading state — table with skeleton rows (no full-screen spinner)
  const isLoading = loading;

  /** Leads that still qualify for a run: new, has contact info, not already sent/in-flight. */
  const remainingEligible = leads.filter(
    (l) =>
      l.status === "new" &&
      (l.email || l.phone) &&
      !["sent", "sending", "pending"].includes(l.outreachStatus ?? "none")
  ).length;

  async function handleRun() {
    if (!activeAgent || starting) return;
    setStarting(true);
    try {
      const res = await startManualRun(activeAgent._id, runCount);
      setActiveCampaign(res.campaign);
      setCampaignPanelOpen(true);
      setRunOpen(false);
      if (res.alreadyRunning) {
        showToast("A run is already in progress — showing its live status.");
      } else {
        showToast(`Outreach started for ${res.campaign.total} lead${res.campaign.total !== 1 ? "s" : ""} — ${res.remainingEligible} more remaining.`, "success");
      }
      fetchLeads(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not start the run.", "error");
    } finally {
      setStarting(false);
    }
  }

  async function startOutreach(lead: Lead) {
    if (activeAgent?.status === "inactive") {
      showToast("Your agent is currently unpublished. Please publish the agent from the top bar first.", "error");
      return;
    }
    // Edge case: don't silently double-message someone who was already contacted.
    if (lead.outreachStatus === "sent" || lead.status !== "new") {
      const when = lead.lastContactedAt
        ? `on ${new Date(lead.lastContactedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
        : "earlier";
      if (!confirm(`${lead.fullName} was already outreached ${when}. Send another message?`)) {
        showToast(`${lead.fullName} was already outreached ${when} — skipped.`, "error");
        return;
      }
    }
    if (lead.outreachStatus === "sending" || lead.outreachStatus === "pending") {
      showToast(`${lead.fullName} is already queued in the current run.`, "error");
      return;
    }
    showToast(`Generating AI outreach for ${lead.firstName}...`);
    try {
      const data = await startLeadOutreach(lead._id, activeAgent?.name || "our team");

      if (data.sent) {
        updateLead(lead._id, { 
          status: "in_outreach", 
          outreachStatus: "sent", 
          lastContactedAt: new Date().toISOString() 
        });
        showToast(
          data.channel === "whatsapp"
            ? `WhatsApp message sent to ${lead.fullName} (no email — used WhatsApp)`
            : `AI email sent to ${lead.fullName}!`,
          "success"
        );
      } else if (data.skipped) {
        updateLead(lead._id, { outreachStatus: "none" });
        showToast(data.reason ?? `Outreach already in progress for ${lead.fullName}.`, "error");
      } else {
        updateLead(lead._id, { outreachStatus: "failed", lastOutreachError: data.reason || "Outreach failed" });
        showToast(`Outreach failed: ${data.reason || "Unknown error"}`, "error");
      }
    } catch (err: unknown) {
      const reason = err instanceof ApiError && err.payload && typeof err.payload === "object"
        ? ((err.payload as { error?: string }).error ?? err.message)
        : err instanceof Error ? err.message : String(err);
      updateLead(lead._id, { outreachStatus: "failed", lastOutreachError: reason });
      showToast(`Error: ${reason}`, "error");
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

  function clearSelection(ids: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function trashLeads(ids: string[], opts: { confirmLabel?: string } = {}) {
    if (!activeAgent || ids.length === 0 || deleting) return;
    const label = opts.confirmLabel ?? `${ids.length} lead${ids.length !== 1 ? "s" : ""}`;
    if (!confirm(`Move ${label} to Trash? You can restore ${ids.length === 1 ? "it" : "them"} later.`)) return;
    setDeleting(true);
    // Optimistic: drop from the active table immediately (also fixes agent leadCount).
    removeLeads(ids);
    clearSelection(ids);
    try {
      const { deleted } = await deleteLeads(activeAgent._id, ids);
      showToast(`Moved ${deleted} lead${deleted !== 1 ? "s" : ""} to Trash`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete leads", "error");
      fetchLeads(); // reconcile if the server rejected the delete
    } finally {
      setDeleting(false);
    }
  }

  async function restoreSelected(ids: string[]) {
    if (!activeAgent || ids.length === 0 || deleting) return;
    setDeleting(true);
    setLeads(leads.filter((l) => !ids.includes(l._id))); // optimistic: leave the Trash list
    clearSelection(ids);
    try {
      const { restored } = await restoreLeads(activeAgent._id, ids);
      updateAgentLeadCount(activeAgent._id, activeAgent.leadCount + restored);
      showToast(`Restored ${restored} lead${restored !== 1 ? "s" : ""}`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to restore leads", "error");
      fetchLeads();
    } finally {
      setDeleting(false);
    }
  }

  async function deleteForever(ids: string[], opts: { confirmLabel?: string } = {}) {
    if (!activeAgent || ids.length === 0 || deleting) return;
    const label = opts.confirmLabel ?? `${ids.length} lead${ids.length !== 1 ? "s" : ""}`;
    if (!confirm(`Permanently delete ${label}? This also removes their conversations and CANNOT be undone.`)) return;
    setDeleting(true);
    setLeads(leads.filter((l) => !ids.includes(l._id))); // optimistic: leave the Trash list
    clearSelection(ids);
    try {
      const { deleted } = await permanentlyDeleteLeads(activeAgent._id, ids);
      showToast(`Permanently deleted ${deleted} lead${deleted !== 1 ? "s" : ""}`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete leads", "error");
      fetchLeads();
    } finally {
      setDeleting(false);
    }
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
    if (activeAgent?.status === "inactive") {
      showToast("Your agent is currently unpublished. Please publish the agent from the top bar first.", "error");
      return;
    }
    const ids = Array.from(selected);
    showToast(`Starting AI outreach for ${ids.length} leads...`);

    const failures: { id: string; reason: string }[] = [];
    let sent = 0;

    // Cap parallel sends so we don't hammer the AI/SMTP providers.
    await mapWithConcurrency(ids, 3, async (id) => {
      updateLead(id, { outreachStatus: "sending" });
      try {
        const data = await startLeadOutreach(id, activeAgent?.name || "our team");
        if (data.sent) {
          sent++;
          updateLead(id, { 
            status: "in_outreach", 
            outreachStatus: "sent", 
            lastContactedAt: new Date().toISOString() 
          });
        } else {
          failures.push({ id, reason: data.reason ?? "Skipped" });
          updateLead(id, { 
            outreachStatus: data.skipped ? "none" : "failed", 
            lastOutreachError: data.reason ?? "Skipped" 
          });
        }
      } catch (err) {
        const reason = err instanceof ApiError && err.payload && typeof err.payload === "object"
          ? ((err.payload as { error?: string }).error ?? err.message)
          : err instanceof Error ? err.message : String(err);
        failures.push({ id, reason });
        updateLead(id, { outreachStatus: "failed", lastOutreachError: reason });
      }
    });

    if (failures.length > 0) {
      const names = failures
        .map((f) => leads.find((l) => l._id === f.id)?.fullName ?? "Unknown")
        .slice(0, 3)
        .join(", ");
      showToast(
        `${sent} sent, ${failures.length} failed (${names}${failures.length > 3 ? "…" : ""}): ${failures[0].reason}`,
        "error"
      );
    } else {
      showToast(`Successfully sent ${sent} AI message${sent !== 1 ? "s" : ""}!`, "success");
    }
    setSelected(new Set());
  }

  const primaryChannel = (lead: Lead): Channel =>
    (lead.channels?.[0] as Channel) ?? "whatsapp";

  return (
    <div style={{ padding: "28px 28px 40px", minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)", letterSpacing: "-0.02em", margin: 0 }}>
          {trashView ? "🗑 Trash" : "Leads"}
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "4px 0 0", fontWeight: 400 }}>
          {trashView ? "Deleted leads — restore or permanently remove" : `Manage contacts and start outreach${leads.length > 0 ? ` · ${leads.length} leads` : ""}`}
        </p>
      </div>


      {/* Unified Compact Toolbar on a Single Line */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        {/* Status pill tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: 3,
            background: "var(--color-bg2)",
            border: "1px solid var(--color-bg4)",
            borderRadius: 12,
            overflowX: "auto",
            flexWrap: "nowrap",
          }}
        >
          {STATUS_TABS.map((tab) => {
            const count = tab.value === "all"
              ? leads.length
              : leads.filter((l) => l.status === tab.value).length;
            const isActive = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: isActive ? "1px solid rgba(99,102,241,0.15)" : "1px solid transparent",
                  background: isActive ? "var(--color-primary-subtle)" : "transparent",
                  color: isActive ? "var(--color-primary-light)" : "var(--color-text3)",
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  cursor: "pointer",
                  transition: "all var(--transition-fast)",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 99,
                    background: isActive ? "rgba(99,102,241,0.12)" : "var(--color-bg3)",
                    color: isActive ? "var(--color-primary-light)" : "var(--color-text4)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Toolbar controls (Search + Run + Filters + Actions) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Search Input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 8,
              background: "var(--color-bg2)",
              border: "1px solid var(--color-bg4)",
              width: 180,
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <IconSearch size={13} style={{ color: "var(--color-text4)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--color-text)", width: "100%" }}
            />
          </div>

          {/* Run button */}
          {!trashView && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setRunOpen((v) => !v)}
                disabled={campaignRunning}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border-none text-white cursor-pointer"
                style={{
                  background: campaignRunning ? "#94a3b8" : "linear-gradient(135deg,#22c97a,#10b981)",
                  height: 30,
                }}
              >
                <IconPlayerPlay size={13} />
                {campaignRunning ? "Running…" : `Run (${remainingEligible})`}
              </button>
              {runOpen && !campaignRunning && (
                <div
                  className="absolute right-0 mt-2 w-64 rounded-xl border bg-white p-3 shadow-lg z-50 text-slate-800"
                  style={{ borderColor: "#e2e8f0" }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 m-0 mb-2">Start outreach run</p>
                  <p className="text-[12px] text-slate-600 m-0 mb-2">
                    {remainingEligible} lead{remainingEligible !== 1 ? "s" : ""} left. How many to contact?
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="number"
                      min={1}
                      max={Math.max(remainingEligible, 1)}
                      value={runCount}
                      onChange={(e) => setRunCount(Math.max(1, parseInt(e.target.value || "1", 10)))}
                      className="form-input w-20 text-[13px]"
                      style={{ padding: "4px 8px" }}
                    />
                    {[10, 15].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRunCount(n)}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setRunCount(Math.max(remainingEligible, 1))}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 cursor-pointer hover:bg-slate-50"
                    >
                      All
                    </button>
                  </div>
                  <button
                    onClick={handleRun}
                    disabled={starting || remainingEligible === 0}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold text-white border-none cursor-pointer"
                    style={{ background: "#10b981", opacity: starting || remainingEligible === 0 ? 0.6 : 1 }}
                  >
                    <IconPlayerPlay size={13} />
                    {starting ? "Starting…" : `Start ${Math.min(runCount, Math.max(remainingEligible, 1))} now`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Filters Toggle Popover */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setFiltersOpen(!filtersOpen); setActionsOpen(false); }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer"
              style={{
                background: filtersOpen ? "var(--color-primary-subtle)" : "var(--color-bg2)",
                borderColor: filtersOpen ? "var(--color-primary-light)" : "var(--color-bg4)",
                color: filtersOpen ? "var(--color-primary-light)" : "var(--color-text2)",
                height: 30,
              }}
            >
              Filters ⚙
            </button>
            {filtersOpen && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-xl border bg-white p-4 shadow-xl z-50 flex flex-col gap-3"
                style={{ borderColor: "var(--color-bg4)", background: "var(--color-bg2)" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text3)", textTransform: "uppercase" }}>Source</label>
                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="form-input w-full"
                    style={{ background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text)" }}
                  >
                    <option value="all">All sources</option>
                    <option value="Google Maps">Google Maps</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="JustDial">JustDial</option>
                    <option value="Manual">Manual</option>
                    <option value="Apify">Apify</option>
                    <option value="Referral">Referral</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text3)", textTransform: "uppercase" }}>Channel</label>
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="form-input w-full"
                    style={{ background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text)" }}
                  >
                    <option value="all">All channels</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="call">Call</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text3)", textTransform: "uppercase" }}>Location</label>
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="form-input w-full"
                    style={{ background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text)" }}
                  >
                    <option value="all">All locations</option>
                    {locations.map((loc) => (
                      <option key={loc.name} value={loc.name}>
                        {loc.name} {!loc.active && "(Inactive)"}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text3)", textTransform: "uppercase" }}>Sync Date</label>
                  <select
                    value={addedDateFilter}
                    onChange={(e) => setAddedDateFilter(e.target.value)}
                    className="form-input w-full"
                    style={{ background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text)" }}
                  >
                    <option value="all">All sync dates</option>
                    {dateOptions.map((d) => (
                      <option key={d.value} value={d.value}>
                        Added {d.label} ({d.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: "var(--color-text3)", textTransform: "uppercase" }}>Outreach Status</label>
                  <select
                    value={outreachFilter}
                    onChange={(e) => setOutreachFilter(e.target.value)}
                    className="form-input w-full"
                    style={{ background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text)" }}
                  >
                    <option value="all">All outreach</option>
                    <option value="none">Not started</option>
                    <option value="pending">Queued</option>
                    <option value="sending">Sending now</option>
                    <option value="sent">Outreached ✓</option>
                    <option value="failed">Failed ✗</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Actions Dropdown Toggle */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setActionsOpen(!actionsOpen); setFiltersOpen(false); }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer"
              style={{
                background: actionsOpen ? "var(--color-primary-subtle)" : "var(--color-bg2)",
                borderColor: actionsOpen ? "var(--color-primary-light)" : "var(--color-bg4)",
                color: actionsOpen ? "var(--color-primary-light)" : "var(--color-text2)",
                height: 30,
              }}
            >
              Actions ▾
            </button>
            {actionsOpen && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-xl border bg-white p-1.5 shadow-xl z-50 flex flex-col gap-0.5"
                style={{ borderColor: "var(--color-bg4)", background: "var(--color-bg2)" }}
              >
                <button
                  onClick={() => { setActionsOpen(false); onAddLead(); }}
                  style={dropdownItemStyle}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-bg3)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <IconPlus size={13} /> Add manually
                </button>
                <button
                  style={dropdownItemStyle}
                  onClick={() => { setActionsOpen(false); }} // triggers topbar sync click
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-bg3)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <IconRefresh size={13} /> Sync Apify
                </button>
                <button
                  onClick={() => { setActionsOpen(false); setMissingContact((v) => !v); }}
                  style={{
                    ...dropdownItemStyle,
                    color: missingContact ? "var(--color-red)" : undefined,
                    background: missingContact ? "var(--color-red-bg)" : undefined,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = missingContact ? "rgba(239,68,68,0.15)" : "var(--color-bg3)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = missingContact ? "var(--color-red-bg)" : "transparent"}
                >
                  <IconAlertCircle size={13} /> {missingContact ? "Show all contacts" : "Show no contact"}
                </button>
                <button
                  onClick={() => { setActionsOpen(false); cleanupIncomplete(); }}
                  style={{ ...dropdownItemStyle, color: "#ff6b6b" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-bg3)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <IconTrash size={13} /> Clean up
                </button>
                <button
                  onClick={() => { setActionsOpen(false); setTrashView((v) => !v); setSelected(new Set()); }}
                  style={{
                    ...dropdownItemStyle,
                    color: trashView ? "var(--color-primary-light)" : undefined,
                    background: trashView ? "var(--color-primary-subtle)" : undefined,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = trashView ? "rgba(99,102,241,0.15)" : "var(--color-bg3)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = trashView ? "var(--color-primary-subtle)" : "transparent"}
                >
                  <IconTrash size={13} /> {trashView ? "Viewing Active" : "Viewing Trash"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar — slides in when items selected */}
      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            marginBottom: 8,
            background: "var(--color-primary-subtle)",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
            animation: "slideDown 150ms ease both",
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "var(--radius-md)",
              background: "var(--color-primary-subtle)",
              border: "1px solid rgba(99,102,241,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary-light)",
            }}
          >
            <IconCheck size={12} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-primary-light)" }}>
            {selected.size} lead{selected.size > 1 ? "s" : ""} selected
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {trashView ? (
              <>
                <button
                  className="inline-flex items-center justify-center gap-1.5 !px-3 !py-[7px] !text-xs !rounded-lg font-semibold !border-none !text-white bg-gradient-to-br from-emerald-500 to-green-500 hover:brightness-105 transition-all duration-200 ease-out whitespace-nowrap disabled:opacity-60"
                  onClick={() => restoreSelected(Array.from(selected))}
                  disabled={deleting}
                  title="Restore selected leads"
                >
                  <IconRestore size={13} /> Restore
                </button>
                <button
                  className="inline-flex items-center justify-center gap-1.5 !px-3 !py-[7px] !text-xs !rounded-lg font-semibold border transition-all duration-200 ease-out whitespace-nowrap disabled:opacity-60"
                  style={{ background: "rgba(255,107,107,0.08)", borderColor: "rgba(255,107,107,0.3)", color: "#ff6b6b" }}
                  onClick={() => deleteForever(Array.from(selected))}
                  disabled={deleting}
                  title="Permanently delete selected leads"
                >
                  <IconTrashX size={13} /> Delete forever
                </button>
              </>
            ) : (
              <>
                <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out !px-3 !py-[7px] !text-xs !rounded-lg whitespace-nowrap" onClick={bulkStartOutreach}>
                  <IconPlayerPlay size={13} /> Start outreach
                </button>
                <button
                  className="inline-flex items-center justify-center gap-1.5 !px-3 !py-[7px] !text-xs !rounded-lg font-semibold border transition-all duration-200 ease-out whitespace-nowrap disabled:opacity-60"
                  style={{ background: "rgba(255,107,107,0.08)", borderColor: "rgba(255,107,107,0.3)", color: "#ff6b6b" }}
                  onClick={() => trashLeads(Array.from(selected))}
                  disabled={deleting}
                  title="Move selected leads to Trash"
                >
                  <IconTrash size={13} /> Delete
                </button>
              </>
            )}
            <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 transition-all duration-200 ease-out hover:bg-slate-50 !px-3 !py-[7px] !text-xs !rounded-lg whitespace-nowrap" onClick={() => setSelected(new Set())}>
              <IconX size={13} /> Deselect
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="data-table min-w-[1100px]">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left" style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={selected.size === leads.length && leads.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? new Set(leads.map((l) => l._id)) : new Set())}
                  className="accent-[#6c63ff] cursor-pointer"
                />
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-widest uppercase whitespace-nowrap" style={{ color: "var(--color-text3)", width: 40 }}>
                Sr
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
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <SkeletonTableRow key={i} cols={10} />
            ))}
            {!isLoading && leads.length === 0 && (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    icon={<IconUsers size={24} />}
                    title={trashView ? "Trash is empty" : "No leads found"}
                    description={trashView ? "Deleted leads appear here." : "Add your first lead or sync from Apify."}
                    compact
                  />
                </td>
              </tr>
            )}
            {leads.map((lead, i) => (
              <tr
                key={lead._id}
                onClick={() => openDrawer(lead, primaryChannel(lead))}
                className={`cursor-pointer transition-colors ${lead.outreachStatus === "sending" ? "animate-pulse" : ""}`}
                style={{
                  background: lead.outreachStatus === "sending"
                    ? "var(--color-primary-subtle)"
                    : selected.has(lead._id) ? "rgba(99,102,241,0.06)" : undefined,
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
                <td className="px-4 py-3 text-[12px] font-semibold text-slate-400">
                  {i + 1}
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
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      {(lead.channels ?? []).map((ch) => {
                        const cfg = CHANNEL_ICONS[ch];
                        if (!cfg) return null;
                        return (
                          <div key={ch} className={`w-6 h-6 rounded-[6px] flex items-center justify-center ${cfg.cls}`} title={`${ch} available`}>
                            <cfg.Icon size={13} />
                          </div>
                        );
                      })}
                    </div>
                    {sequence && sequence.steps && sequence.steps.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5" title="Outreach Sequence channels">
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                          Seq:
                        </span>
                        <div className="flex gap-0.5 items-center">
                          {sequence.steps.map((step: any, idx: number) => {
                            const cfg = CHANNEL_ICONS[step.channel];
                            if (!cfg) return null;
                            const isWhatsApp = step.channel === "whatsapp";
                            return (
                              <span 
                                key={idx} 
                                className="inline-flex items-center" 
                                title={`Step ${step.order}: ${step.channel} (Day ${step.dayOffset})`}
                                style={{ color: isWhatsApp ? "#22c97a" : "var(--color-text3)" }}
                              >
                                <cfg.Icon size={10} />
                                {idx < sequence.steps.length - 1 && <span className="mx-0.5 text-[9px] text-slate-400">→</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusPill status={lead.status} />
                    {lead.outreachStatus === "sending" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                        style={{ background: "rgba(99,102,241,0.12)", color: "#6366f1", border: "1px solid rgba(99,102,241,0.3)" }}>
                        ● Sending…
                      </span>
                    )}
                    {lead.outreachStatus === "pending" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(245,166,35,0.1)", color: "#f5a623", border: "1px solid rgba(245,166,35,0.3)" }}>
                        Queued
                      </span>
                    )}
                    {lead.outreachStatus === "sent" && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(34,201,122,0.1)", color: "#22c97a", border: "1px solid rgba(34,201,122,0.3)" }}
                        title={lead.lastContactedAt ? `Outreached ${new Date(lead.lastContactedAt).toLocaleString("en-IN")}` : "Outreached"}
                      >
                        ✓ Outreached
                      </span>
                    )}
                    {lead.outreachStatus === "failed" && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full cursor-help"
                        style={{ background: "rgba(255,107,107,0.1)", color: "#ff6b6b", border: "1px solid rgba(255,107,107,0.3)" }}
                        title={lead.lastOutreachError || "Send failed — will retry on the next run"}
                      >
                        ✗ Failed
                      </span>
                    )}
                  </div>
                </td>
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
                    {trashView ? (
                      <>
                        <button
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold text-white whitespace-nowrap transition-all duration-150 hover:brightness-105"
                          style={{ padding: "5px 10px", background: "linear-gradient(135deg,#22c97a,#10b981)", border: "none", cursor: "pointer" }}
                          onClick={() => restoreSelected([lead._id])}
                          disabled={deleting}
                          title="Restore this lead"
                        >
                          <IconRestore size={12} /> Restore
                        </button>
                        <button
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap transition-all duration-150 hover:brightness-95"
                          style={{ padding: "5px 10px", background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)", color: "#ff6b6b", cursor: "pointer" }}
                          onClick={() => deleteForever([lead._id], { confirmLabel: lead.fullName })}
                          disabled={deleting}
                          title="Permanently delete this lead"
                        >
                          <IconTrashX size={12} /> Delete forever
                        </button>
                      </>
                    ) : (
                    <>
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
                    <button
                      className="inline-flex items-center justify-center rounded-lg transition-all duration-150 hover:brightness-95"
                      style={{ padding: "5px 8px", background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)", color: "#ff6b6b", cursor: "pointer" }}
                      onClick={() => trashLeads([lead._id], { confirmLabel: lead.fullName })}
                      disabled={deleting}
                      title="Move this lead to Trash"
                    >
                      <IconTrash size={12} />
                    </button>
                    </>
                    )}
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

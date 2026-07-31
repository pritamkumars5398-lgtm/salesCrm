"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { IconSearch, IconFilter, IconChevronDown, IconCheck, IconX } from "@tabler/icons-react";
import { SOURCE_META } from "@/lib/constants/leads";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";
import { useAppStore } from "@/store/useAppStore";
import Avatar from "@/components/ui/Avatar";
import StatusPill from "@/components/ui/Pill";
import { CRM_STAGES as STAGES } from "@/lib/constants/crm";
import LeadDetailPanel from "@/components/ui/LeadDetailPanel";
import { startLeadOutreach } from "@/lib/api/leads.api";
import type { Lead } from "@/store/types";
import { IconMessageCircle } from "@tabler/icons-react";

export default function CRM() {
  const { activeAgent, leads, setLeads, updateLead, openDrawer, showToast } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [moveModal, setMoveModal] = useState<{
    lead: any;
    targetStage: string;
    note: string;
  } | null>(null);

  async function handleStartOutreach(lead: any) {
    if (activeAgent?.status === "inactive") {
      showToast("Your agent is currently unpublished. Please publish the agent from the top bar first.", "error");
      return;
    }
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
            : `Email sent to ${lead.fullName}`,
          "success"
        );
      } else {
        showToast(`Outreach failed: ${data.error || data.reason || "Unknown error"}`, "error");
      }
    } catch (err: any) {
      showToast(err.message || "Outreach failed", "error");
    }
  }

  const [loadingCols, setLoadingCols] = useState<Record<string, boolean>>({});
  const [pages, setPages] = useState<Record<string, number>>({});
  const [hasMoreCols, setHasMoreCols] = useState<Record<string, boolean>>({});
  const [totalCols, setTotalCols] = useState<Record<string, number>>({});

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [addedDateFilter, setAddedDateFilter] = useState("all");
  const [outreachFilter, setOutreachFilter] = useState("all");
  const [jobTitleFilter, setJobTitleFilter] = useState("all");
  const [missingContact, setMissingContact] = useState(false);

  const fetchColumn = useCallback(async (stageKey: string, pageNum: number, isInitial = false) => {
    if (!activeAgent) return;
    setLoadingCols(p => ({ ...p, [stageKey]: true }));
    try {
      const params = new URLSearchParams({
        agentId: activeAgent._id,
        page: String(pageNum),
        limit: "50",
        pipelineStage: stageKey,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (locationFilter !== "all") params.set("location", locationFilter);
      if (addedDateFilter !== "all") params.set("addedDate", addedDateFilter);
      if (outreachFilter !== "all") params.set("outreachStatus", outreachFilter);
      if (jobTitleFilter !== "all") params.set("jobTitle", jobTitleFilter);
      if (search) params.set("q", search);
      if (missingContact) params.set("missingContact", "true");

      const data = await fetch(`/api/leads?${params}`).then((r) => r.json());
      
      setLeads((prev: Lead[]) => {
        if (isInitial) {
           const others = prev.filter(l => l.pipelineStage !== stageKey);
           return [...others, ...(data.leads ?? [])];
        } else {
           const existingIds = new Set(prev.map(l => l._id));
           const newLeads = (data.leads ?? []).filter((l: Lead) => !existingIds.has(l._id));
           return [...prev, ...newLeads];
        }
      });
      
      setHasMoreCols(p => ({ ...p, [stageKey]: data.page < data.totalPages }));
      setTotalCols(p => ({ ...p, [stageKey]: data.total }));
    } finally {
      setLoadingCols(p => ({ ...p, [stageKey]: false }));
    }
  }, [activeAgent?._id, search, sourceFilter, channelFilter, locationFilter, addedDateFilter, outreachFilter, jobTitleFilter, missingContact, setLeads]);

  useEffect(() => {
    if (!activeAgent) return;
    setLoading(true);
    Promise.all(STAGES.map(({ key }) => {
      setPages(p => ({ ...p, [key]: 1 }));
      return fetchColumn(key, 1, true);
    })).finally(() => setLoading(false));
  }, [fetchColumn, activeAgent?._id]);

  const observersRef = useRef<Record<string, IntersectionObserver | null>>({});
  const lastLeadElementRefs = useCallback((node: HTMLDivElement | null, stageKey: string) => {
    if (loadingCols[stageKey]) return;
    if (observersRef.current[stageKey]) observersRef.current[stageKey]!.disconnect();

    observersRef.current[stageKey] = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreCols[stageKey]) {
         setPages(p => {
           const next = (p[stageKey] || 1) + 1;
           fetchColumn(stageKey, next, false);
           return { ...p, [stageKey]: next };
         });
      }
    });

    if (node) observersRef.current[stageKey]!.observe(node);
  }, [loadingCols, hasMoreCols, fetchColumn]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <div className="text-[13px] font-semibold tracking-wide text-text3">Loading pipeline...</div>
        </div>
      </div>
    );
  }

  async function moveLead(leadId: string, stage: string, note?: string) {
    const lead = leads.find((l) => l._id === leadId);
    if (!lead) return;

    const previousStage = lead.pipelineStage;
    // Optimistic UI update
    updateLead(leadId, { ...lead, pipelineStage: stage });

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStage: stage, changeNote: note }),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      updateLead(leadId, updated);
      showToast("Stage updated successfully", "success");
    } catch (err) {
      // Revert if failed
      updateLead(leadId, { ...lead, pipelineStage: previousStage });
      showToast("Failed to update stage", "error");
    }
  }

  const handleDragStart = (e: React.DragEvent, lead: any) => {
    e.dataTransfer.setData("text/plain", lead._id);
    setDraggingId(lead._id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    if (draggingId) {
      const draggingLead = leads.find((l) => l._id === draggingId);
      if (draggingLead && draggingLead.pipelineStage !== stageKey) {
        setDragOverStage(stageKey);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData("text/plain") || draggingId;
    if (!leadId) return;

    const lead = leads.find((l) => l._id === leadId);
    if (!lead || lead.pipelineStage === stageKey) return;

    setMoveModal({ lead, targetStage: stageKey, note: "" });
  };

  const confirmMove = () => {
    if (!moveModal) return;
    moveLead(moveModal.lead._id, moveModal.targetStage, moveModal.note.trim());
    setMoveModal(null);
  };

  const cancelMove = () => {
    setMoveModal(null);
  };

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">
            CRM Pipeline{" "}
            <span className="text-[13px] font-normal" style={{ color: "var(--color-text3)" }}>
              Track leads through sales stages
            </span>
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", width: 180, boxShadow: "var(--shadow-xs)" }}>
            <IconSearch size={13} style={{ color: "var(--color-text4)", flexShrink: 0 }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search CRM..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, color: "var(--color-text)", width: "100%" }} />
          </div>
          <div style={{ position: "relative" }}>
            <button onClick={() => setFiltersOpen(!filtersOpen)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-bg4)", background: "var(--color-bg2)", color: "var(--color-text2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", transition: "all var(--transition-fast)", boxShadow: "var(--shadow-xs)" }}>
              <IconFilter size={14} /> Filters <IconChevronDown size={14} style={{ marginLeft: 2, opacity: 0.7 }} />
            </button>
            {filtersOpen && (
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 280, background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 100, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text3)" }}>Filters</span>
                  <button onClick={() => setFiltersOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text3)" }}><IconX size={14} /></button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)" }}>Missing Contact Info</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--color-text)", cursor: "pointer" }}>
                    <input type="checkbox" checked={missingContact} onChange={(e) => setMissingContact(e.target.checked)} className="accent-[#df2a2a] cursor-pointer" />
                    Show leads with no email AND no phone
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="grid gap-3 min-w-[1100px]" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          {STAGES.map(({ key, label, pillClass }) => {
            const stageLeads = leads.filter((l) => (l.pipelineStage ?? "new") === key);
            const isDraggingOver = dragOverStage === key;

            return (
              <div
                key={key}
                className="rounded-[14px] p-3 border min-w-0 transition-all duration-200"
                style={{
                  background: isDraggingOver ? "rgba(223,42,42,0.04)" : "var(--color-bg2)",
                  borderColor: isDraggingOver ? "#df2a2a" : "rgba(0,0,0,0.1)",
                  minHeight: 450,
                  boxShadow: isDraggingOver ? "0 0 14px rgba(223,42,42,0.12)" : "none",
                }}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => handleDrop(e, key)}
              >
                <div className="flex items-center justify-between mb-3 min-w-0">
                  <span className="text-[11px] font-semibold tracking-widest uppercase truncate" style={{ color: "var(--color-text3)" }}>
                    {label}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase border border-black/10 ${pillClass} text-[10px] flex-shrink-0`}>
                    {totalCols[key] !== undefined ? totalCols[key] : stageLeads.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2" style={{ minHeight: "100%" }}>
                  {stageLeads.map((lead, index) => {
                    const isDragging = draggingId === lead._id;
                    const isLast = index === stageLeads.length - 1;
                    return (
                      <div
                        key={lead._id}
                        ref={isLast ? (node) => lastLeadElementRefs(node, key) : null}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onDragEnd={handleDragEnd}
                        className="p-3 rounded-[10px] border cursor-grab active:cursor-grabbing transition-all duration-200 min-w-0"
                        style={{
                          background: "var(--color-bg3)",
                          borderColor: "rgba(0,0,0,0.1)",
                          opacity: isDragging ? 0.4 : 1,
                          transform: isDragging ? "scale(0.96)" : "none",
                          boxShadow: isDragging ? "none" : "0 2px 4px rgba(0,0,0,0.02)",
                        }}
                        onClick={() => setSelectedLead(lead)}
                        onMouseEnter={(e) => {
                          if (!isDragging) e.currentTarget.style.borderColor = "rgba(0,0,0,0.2)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isDragging) e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)";
                        }}
                      >
                        <div className="flex items-center justify-between mb-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Avatar name={lead.fullName} size="sm" />
                            <div className="text-[13px] font-medium truncate" title={lead.fullName}>{lead.fullName}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(lead, lead.channels?.[0] || "whatsapp");
                            }}
                            style={{
                              padding: 4,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--color-text3)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 6,
                              transition: "color 0.15s, background-color 0.15s",
                            }}
                            title="Open Conversation"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#df2a2a";
                              e.currentTarget.style.backgroundColor = "var(--color-bg4)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "var(--color-text3)";
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <IconMessageCircle size={14} />
                          </button>
                        </div>
                        <div className="text-[11.5px] truncate" style={{ color: "var(--color-text3)" }} title={lead.company}>{lead.company}</div>
                        {lead.status === "meeting_booked" && (
                          <div className="mt-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase border border-emerald-500/20 bg-emerald-50 text-emerald-600 text-[10px]">
                              Meeting booked
                            </span>
                          </div>
                        )}
                        <select
                          className="w-full bg-bg2 border border-bg4 rounded-xl px-3 py-2.5 text-text text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-text3 mt-2 cursor-pointer"
                          style={{ fontSize: 11, padding: "3px 6px" }}
                          value={lead.pipelineStage ?? "new"}
                          onChange={(e) => {
                            e.stopPropagation();
                            setMoveModal({ lead, targetStage: e.target.value, note: "" });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  {loadingCols[key] && pages[key] > 1 && (
                    <div className="flex justify-center py-2">
                      <div className="w-4 h-4 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    </div>
                  )}
                  {stageLeads.length === 0 && !loadingCols[key] && (
                    <div style={{
                      height: 80,
                      border: "2px dashed var(--color-bg4)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      color: "var(--color-text3)",
                      opacity: 0.6,
                    }}>
                      Drop leads here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Change Note Modal */}
      {moveModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "var(--color-bg2)",
              border: "1px solid var(--color-bg4)",
              borderRadius: 20,
              width: "100%",
              maxWidth: 420,
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
              boxSizing: "border-box",
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px 0" }}>Update Pipeline Stage</h3>
            <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "0 0 20px 0", lineHeight: 1.4 }}>
              Move <strong>{moveModal.lead.fullName}</strong> to{" "}
              <strong style={{ color: "#df2a2a" }}>
                {STAGES.find((s) => s.key === moveModal.targetStage)?.label}
              </strong>
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              <label style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text3)" }}>
                Add change log note (optional)
              </label>
              <textarea
                placeholder="Why is this lead's stage changing? (e.g. Replied to WhatsApp, qualified call, etc.)"
                value={moveModal.note}
                onChange={(e) => setMoveModal({ ...moveModal, note: e.target.value })}
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--color-bg3)",
                  border: "1px solid var(--color-bg4)",
                  color: "var(--color-text)",
                  fontSize: 12.5,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={cancelMove}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  background: "var(--color-bg3)",
                  color: "var(--color-text2)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  border: "1px solid var(--color-bg4)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmMove}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #df2a2a, #f24444)",
                  color: "#fff",
                  fontSize: 12.5,
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(223,42,42,0.25)",
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStartOutreach={handleStartOutreach}
        />
      )}
    </div>
  );
}

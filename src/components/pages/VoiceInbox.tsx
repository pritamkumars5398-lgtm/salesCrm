"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconPhone, IconPhoneCall } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead, CallStatus } from "@/store/types";
import Avatar from "@/components/ui/Avatar";
import CallConvo, { CALL_STATUS_META, ACTIVE_CALL_STATUSES, fmtDuration } from "@/components/drawer/CallConvo";
import { formatTimestamp } from "@/components/inbox/InboxLeadList";

const ACCENT = "#f5a623";

interface LastCall {
  _id: string;
  status: CallStatus;
  createdAt: string;
  answeredAt?: string;
  durationSec?: number;
  summary?: string;
  sentiment?: "positive" | "neutral" | "negative";
  outcome?: string;
  error?: string;
}

interface CalledRow {
  lead: Lead;
  lastCall: LastCall;
  total: number;
  answered: number;
  talkSec: number;
}

interface Stats {
  calls: number;
  answered: number;
  live: number;
  talkSec: number;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "answered", label: "Answered" },
  { id: "missed", label: "Not answered" },
  { id: "failed", label: "Failed" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function fmtTalkTime(sec: number) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function callPreview(c: LastCall): string {
  if (c.status === "completed") {
    const bits = [fmtDuration(c.durationSec), c.outcome?.replace(/_/g, " "), c.summary].filter(Boolean);
    return bits.join(" · ");
  }
  return c.error && c.status === "failed" ? c.error : CALL_STATUS_META[c.status]?.label ?? c.status;
}

export default function VoiceInbox() {
  const { activeAgent } = useAppStore();
  const agentId = activeAgent?._id;

  const [rows, setRows] = useState<CalledRow[]>([]);
  const [stats, setStats] = useState<Stats>({ calls: 0, answered: 0, live: 0, talkSec: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Leads with a phone number that haven't been called yet (paged, like the WhatsApp inbox)
  const [others, setOthers] = useState<Lead[]>([]);
  const [othersPage, setOthersPage] = useState(1);
  const [othersHasMore, setOthersHasMore] = useState(true);
  const [othersLoading, setOthersLoading] = useState(false);

  const selectedSig = useRef("");
  const othersReq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  async function loadCalls(showSpinner = false) {
    if (!agentId) return;
    if (showSpinner) setLoading(true);
    try {
      const qs = new URLSearchParams({ agentId, status: filter });
      if (debouncedSearch) qs.set("q", debouncedSearch);
      const res = await fetch(`/api/voice/calls?${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.rows ?? []);
      setStats(data.stats ?? { calls: 0, answered: 0, live: 0, talkSec: 0 });
    } catch {
      // next poll retries
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  async function loadOthers(page: number) {
    // Page 1 (new search/filter) always runs; extra pages wait for the current one.
    if (!agentId || (page > 1 && othersLoading)) return;
    const reqId = ++othersReq.current;
    setOthersLoading(true);
    try {
      const q = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "";
      const res = await fetch(`/api/leads?agentId=${agentId}&page=${page}&limit=25&requireContact=phone${q}`);
      const data = await res.json();
      if (reqId !== othersReq.current) return; // a newer search superseded this one
      const fresh: Lead[] = data.leads ?? [];
      setOthersHasMore(page < (data.totalPages ?? 1));
      setOthers((prev) => {
        if (page === 1) return fresh;
        const seen = new Set(prev.map((l) => l._id));
        return [...prev, ...fresh.filter((l) => !seen.has(l._id))];
      });
      setOthersPage(page);
    } catch {
      // ignore — user can scroll again
    } finally {
      if (reqId === othersReq.current) setOthersLoading(false);
    }
  }

  useEffect(() => {
    loadCalls(true);
    if (filter === "all") loadOthers(1);
    else setOthers([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, filter, debouncedSearch]);

  // Poll faster while any call is live so statuses and transcripts stay current.
  useEffect(() => {
    const id = setInterval(() => loadCalls(false), stats.live > 0 ? 4000 : 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, filter, debouncedSearch, stats.live]);

  // When the selected lead's latest call changes (ended, summary arrived…), refresh its history panel.
  useEffect(() => {
    if (!selectedLead) return;
    const row = rows.find((r) => r.lead._id === selectedLead._id);
    const sig = row ? `${row.lastCall._id}:${row.lastCall.status}:${row.lastCall.summary ?? ""}:${row.total}` : "";
    if (sig !== selectedSig.current) {
      selectedSig.current = sig;
      setRefreshKey((k) => k + 1);
    }
  }, [rows, selectedLead]);

  const calledIds = useMemo(() => new Set(rows.map((r) => r.lead._id)), [rows]);
  const uncalled = useMemo(() => others.filter((l) => !calledIds.has(l._id)), [others, calledIds]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (filter === "all" && othersHasMore && !othersLoading && scrollHeight - scrollTop - clientHeight < 80) {
      loadOthers(othersPage + 1);
    }
  }

  if (!activeAgent) return null;

  const answerRate = stats.calls ? Math.round((stats.answered / stats.calls) * 100) : 0;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--color-bg)" }}>
      {/* Header: stats + filters */}
      <div className="flex items-center gap-2 px-4 border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: "var(--color-bg4)", height: 52 }}>
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 rounded-[9px] flex-shrink-0" style={{ height: 34, background: `${ACCENT}1f`, color: ACCENT }}>
          <IconPhone size={15} /> Voice calls
        </span>
        {[
          { label: "Calls", val: String(stats.calls) },
          { label: "Answered", val: `${stats.answered}${stats.calls ? ` (${answerRate}%)` : ""}` },
          { label: "Talk time", val: fmtTalkTime(stats.talkSec) },
        ].map(({ label, val }) => (
          <span key={label} className="text-[11.5px] px-2.5 py-1 rounded-md flex-shrink-0" style={{ background: "var(--color-bg3)", color: "var(--color-text3)" }}>
            {label} <b style={{ color: "var(--color-text)" }}>{val}</b>
          </span>
        ))}
        {stats.live > 0 && (
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-md flex-shrink-0" style={{ background: "rgba(34,201,122,0.14)", color: "#22c97a" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#22c97a" }} />
            {stats.live} live
          </span>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Lead list */}
        <div className="flex flex-col h-full flex-shrink-0" style={{ width: 300, borderRight: "1px solid var(--color-bg4)", background: "var(--color-bg2)" }}>
          <div className="p-3 flex flex-col gap-2 flex-shrink-0 border-b" style={{ borderColor: "var(--color-bg4)" }}>
            <div className="relative">
              <IconSearch size={14} className="absolute top-1/2 -translate-y-1/2 left-2.5" style={{ color: "var(--color-text3)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="w-full text-[12.5px] rounded-lg pl-8 pr-3 py-2 outline-none border"
                style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)" }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md border-none cursor-pointer"
                  style={{ background: filter === id ? `${ACCENT}1f` : "var(--color-bg3)", color: filter === id ? ACCENT : "var(--color-text3)" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-[12px]" style={{ color: "var(--color-text3)" }}>Loading…</div>
            ) : (
              <>
                {rows.length === 0 && (filter !== "all" || uncalled.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-14 px-4 text-center gap-1">
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--color-text2)" }}>
                      {filter === "all" ? "No leads found" : "No calls match this filter"}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-text3)" }}>
                      {search ? "Try a different search." : "Calls you place to leads show up here."}
                    </p>
                  </div>
                )}

                {rows.map(({ lead, lastCall, total }) => {
                  const isSelected = selectedLead?._id === lead._id;
                  const meta = CALL_STATUS_META[lastCall.status] ?? CALL_STATUS_META.failed;
                  const live = ACTIVE_CALL_STATUSES.includes(lastCall.status);
                  return (
                    <button
                      key={lead._id}
                      onClick={() => setSelectedLead(lead)}
                      className="flex items-start gap-2.5 w-full text-left px-3 py-2.5 border-none cursor-pointer transition-colors"
                      style={{ background: isSelected ? "var(--color-bg3)" : "transparent", borderBottom: "1px solid var(--color-bg4)" }}
                    >
                      <Avatar name={lead.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12.5px] font-semibold truncate" style={{ color: isSelected ? ACCENT : "var(--color-text)" }}>
                            {lead.fullName}
                          </span>
                          <span className="text-[10px] flex-shrink-0" style={{ color: "var(--color-text3)" }}>
                            {formatTimestamp(lastCall.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 rounded-full text-[9.5px] font-semibold uppercase tracking-wide flex-shrink-0 ${live ? "animate-pulse" : ""}`}
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[11px] truncate" style={{ color: "var(--color-text3)" }}>
                            {callPreview(lastCall)}
                          </span>
                        </div>
                        {total > 1 && (
                          <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text4)" }}>{total} calls</div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {filter === "all" && uncalled.length > 0 && (
                  <>
                    <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
                      Not called yet
                    </div>
                    {uncalled.map((lead) => {
                      const isSelected = selectedLead?._id === lead._id;
                      return (
                        <button
                          key={lead._id}
                          onClick={() => setSelectedLead(lead)}
                          className="flex items-start gap-2.5 w-full text-left px-3 py-2.5 border-none cursor-pointer transition-colors"
                          style={{ background: isSelected ? "var(--color-bg3)" : "transparent", borderBottom: "1px solid var(--color-bg4)" }}
                        >
                          <Avatar name={lead.fullName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold truncate" style={{ color: isSelected ? ACCENT : "var(--color-text)" }}>
                              {lead.fullName}
                            </span>
                            <span className="block text-[11px] truncate mt-0.5" style={{ color: "var(--color-text3)" }}>
                              {[lead.jobTitle, lead.location, lead.phone].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
                {othersLoading && (
                  <div className="flex items-center justify-center py-4 text-[11px]" style={{ color: "var(--color-text3)" }}>Loading more…</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Selected lead's calls */}
        <div className="flex-1 min-w-0">
          {selectedLead ? (
            <CallConvo
              key={selectedLead._id}
              lead={selectedLead}
              refreshKey={refreshKey}
              onCallStarted={() => loadCalls(false)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <span className="flex items-center justify-center mb-3" style={{ width: 56, height: 56, borderRadius: 16, background: `${ACCENT}14` }}>
                <IconPhoneCall size={24} style={{ color: ACCENT }} />
              </span>
              <p className="text-[13px] font-medium" style={{ color: "var(--color-text2)" }}>Select a lead</p>
              <p className="text-[11.5px] mt-1 max-w-[280px]" style={{ color: "var(--color-text3)" }}>
                See every call with recordings, transcripts and AI summaries — or place a new AI call.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

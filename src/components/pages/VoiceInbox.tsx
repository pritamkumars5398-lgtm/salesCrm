"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconSearch, IconPhone, IconPhoneCall, IconPlayerStop, IconX } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Lead, CallStatus } from "@/store/types";
import Avatar from "@/components/ui/Avatar";
import CallConvo, { CALL_STATUS_META, ACTIVE_CALL_STATUSES, fmtDuration } from "@/components/drawer/CallConvo";
import { formatTimestamp } from "@/components/inbox/InboxLeadList";
import GroupFilterSelect from "@/components/leads/GroupFilterSelect";

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
  { id: "uncalled", label: "Not called" },
  { id: "live", label: "Live" },
  { id: "answered", label: "Answered" },
  { id: "missed", label: "Not answered" },
  { id: "failed", label: "Failed" },
  { id: "saved", label: "★ Saved" },
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
  const { activeAgent, showToast } = useAppStore();
  const agentId = activeAgent?._id;

  const [rows, setRows] = useState<CalledRow[]>([]);
  const [stats, setStats] = useState<Stats>({ calls: 0, answered: 0, live: 0, talkSec: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>("all");
  // Narrow by how the latest call went. Uncalled leads have no call, so they hide while these are set.
  const [outcome, setOutcome] = useState("");
  const [sentiment, setSentiment] = useState("");
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;
  const sentimentRef = useRef(sentiment);
  sentimentRef.current = sentiment;
  const callFilterOn = !!(outcome || sentiment);
  const [groupId, setGroupId] = useState("");
  const groupRef = useRef(groupId);
  groupRef.current = groupId;
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

  // Pick several leads and let the AI call them one after another.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<{ total: number; done: number; failed: number; current: string; max: number } | null>(null);
  const stopRun = useRef(false);

  function togglePick(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function callSlots(): Promise<{ live: number; max: number }> {
    try {
      const res = await fetch(`/api/voice/calls?agentId=${agentId}&status=live`);
      const data = await res.json();
      return { live: data?.slots?.live ?? data?.stats?.live ?? 0, max: Math.max(1, data?.slots?.max ?? 1) };
    } catch {
      return { live: 0, max: 1 };
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /**
   * Call the picked leads several at a time: dial as long as a line is free (up to the
   * workspace's "calls at once" limit), and dial the next lead as soon as a call ends.
   */
  async function callPicked() {
    if (!agentId || run) return;
    const leadById = new Map([...rows.map((r) => r.lead), ...others].map((l) => [l._id, l]));
    const ids = [...picked].filter((id) => leadById.has(id));
    if (!ids.length) return;
    stopRun.current = false;
    let done = 0;
    let failed = 0;
    const first = await callSlots();
    setRun({ total: ids.length, done, failed, current: "", max: first.max });
    for (const id of ids) {
      if (stopRun.current) break;
      const lead = leadById.get(id)!;
      // wait for a free line (all lines busy = wait for one call to end; ~15 min at most)
      let placed = false;
      for (let t = 0; t < 225 && !stopRun.current && !placed; t++) {
        const slots = await callSlots();
        setRun({ total: ids.length, done, failed, current: lead.fullName, max: slots.max });
        if (slots.live >= slots.max) { await sleep(4000); continue; }
        const res = await fetch(`/api/leads/${id}/call`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => null);
        if (res?.status === 429) { await sleep(4000); continue; } // a line was taken meanwhile — wait
        placed = true;
        if (!res?.ok) {
          failed++;
          const data = res ? await res.json().catch(() => ({})) : {};
          // setup problems or plan limits stop the whole run instead of failing every lead
          if (!res || res.status === 403 || res.status === 503 || /limit|not set up|isn't set up|configured|aren't ready/i.test(data.error || "")) {
            showToast(data.error || "Calling stopped — couldn't reach the server.", "error");
            stopRun.current = true;
          }
        } else {
          done++;
          setPicked((p) => { const n = new Set(p); n.delete(id); return n; });
          setOthers((prev) => prev.filter((l) => l._id !== id)); // called now: off the "Not called" list
          await sleep(2500); // let the call register as live before filling the next line
          loadCalls(false);
        }
      }
      if (!placed && !stopRun.current) { failed++; }
      setRun((r) => (r ? { ...r, done, failed } : r));
    }
    setRun(null);
    loadCalls(false);
    showToast(`${done} call${done === 1 ? "" : "s"} placed${failed ? `, ${failed} failed` : ""}${stopRun.current ? " — stopped" : ""}`, failed && !done ? "error" : "success");
  }
  const othersReq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Long-running work (the "Call selected" queue, polling) calls loadCalls from old renders,
  // so it reads the filter and search from refs — always what's on screen now — and only the
  // newest request may update the list (an older, slower answer can't blank it).
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const searchRef = useRef(debouncedSearch);
  searchRef.current = debouncedSearch;
  const callsReq = useRef(0);

  async function loadCalls(showSpinner = false) {
    if (!agentId) return;
    const reqId = ++callsReq.current;
    const currentFilter = filterRef.current;
    if (currentFilter === "uncalled") {
      setRows([]);
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    try {
      const qs = new URLSearchParams({ agentId, status: currentFilter });
      if (searchRef.current) qs.set("q", searchRef.current);
      if (outcomeRef.current) qs.set("outcome", outcomeRef.current);
      if (sentimentRef.current) qs.set("sentiment", sentimentRef.current);
      if (groupRef.current) qs.set("groupId", groupRef.current);
      const res = await fetch(`/api/voice/calls?${qs}`);
      if (!res.ok) return;
      const data = await res.json();
      if (reqId !== callsReq.current) return; // a newer refresh already ran
      setRows(data.rows ?? []);
      setStats(data.stats ?? { calls: 0, answered: 0, live: 0, talkSec: 0 });
    } catch {
      // next poll retries
    } finally {
      if (showSpinner && reqId === callsReq.current) setLoading(false);
    }
  }

  async function loadOthers(page: number) {
    // Page 1 (new search/filter) always runs; extra pages wait for the current one.
    if (!agentId || (page > 1 && othersLoading)) return;
    const reqId = ++othersReq.current;
    setOthersLoading(true);
    try {
      const q = (debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "") + (groupId ? `&groupId=${groupId}` : "");
      // The server leaves out every lead that was ever called, so "Not called" stays right
      // whichever filter is on (the call rows aren't loaded for the "Not called" filter).
      const res = await fetch(`/api/leads?agentId=${agentId}&page=${page}&limit=25&requireContact=phone&notCalled=1${q}`);
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
    if ((filter === "all" || filter === "uncalled") && !callFilterOn) loadOthers(1);
    else setOthers([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, filter, debouncedSearch, outcome, sentiment, groupId]);

  // Poll faster while any call is live so statuses and transcripts stay current.
  useEffect(() => {
    const id = setInterval(() => loadCalls(false), stats.live > 0 ? 4000 : 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, filter, debouncedSearch, stats.live, outcome, sentiment, groupId]);

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
    if ((filter === "all" || filter === "uncalled") && othersHasMore && !othersLoading && scrollHeight - scrollTop - clientHeight < 80) {
      loadOthers(othersPage + 1);
    }
  }

  const checkbox = (id: string) => (
    <input
      type="checkbox"
      checked={picked.has(id)}
      disabled={!!run}
      onClick={(e) => e.stopPropagation()}
      onChange={() => togglePick(id)}
      className="mt-2 flex-shrink-0 cursor-pointer"
      style={{ accentColor: ACCENT }}
      aria-label="Select to call"
    />
  );

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
                className="w-full text-[12.5px] rounded-lg pl-8 pr-3 py-1.5 outline-none border"
                style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)" }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className="text-[11px] font-semibold px-2 py-[3px] rounded-full border-none cursor-pointer"
                  style={{ background: filter === id ? `${ACCENT}1f` : "var(--color-bg3)", color: filter === id ? ACCENT : "var(--color-text3)" }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Group + how the latest call went, in one row */}
            <div className="flex gap-1.5">
              {agentId && <GroupFilterSelect agentId={agentId} value={groupId} onChange={setGroupId} variant="pill" accent={ACCENT} className="flex-1" />}
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="flex-1 min-w-0 text-[11.5px] font-semibold px-2 py-1 rounded-md border cursor-pointer"
                style={{ background: outcome ? `${ACCENT}1f` : "var(--color-bg3)", borderColor: "var(--color-bg4)", color: outcome ? ACCENT : "var(--color-text2)" }}
              >
                <option value="">Outcome</option>
                <option value="interested">Interested</option>
                <option value="callback">Call back later</option>
                <option value="not_interested">Not interested</option>
                <option value="no_decision">No decision</option>
                <option value="wrong_number">Wrong number</option>
              </select>
              <select
                value={sentiment}
                onChange={(e) => setSentiment(e.target.value)}
                className="flex-1 min-w-0 text-[11.5px] font-semibold px-2 py-1 rounded-md border cursor-pointer"
                style={{ background: sentiment ? `${ACCENT}1f` : "var(--color-bg3)", borderColor: "var(--color-bg4)", color: sentiment ? ACCENT : "var(--color-text2)" }}
              >
                <option value="">Mood</option>
                <option value="positive">😊 Positive</option>
                <option value="neutral">😐 Neutral</option>
                <option value="negative">🙁 Negative</option>
              </select>
              {(callFilterOn || !!groupId) && (
                <button type="button" title="Clear filters" onClick={() => { setOutcome(""); setSentiment(""); setGroupId(""); }} className="text-[11px] px-2 rounded-md border-none cursor-pointer" style={{ background: "var(--color-bg3)", color: "var(--color-text3)" }}>Clear</button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
            {loading ? (
              <div className="flex items-center justify-center py-10 text-[12px]" style={{ color: "var(--color-text3)" }}>Loading…</div>
            ) : (
              <>
                {rows.length === 0 && ((filter !== "all" && filter !== "uncalled") || callFilterOn || uncalled.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-14 px-4 text-center gap-1">
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--color-text2)" }}>
                      {(filter === "all" || filter === "uncalled") && !callFilterOn ? "No uncalled leads found" : "No calls match this filter"}
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
                    <div
                      role="button"
                      tabIndex={0}
                      key={lead._id}
                      onClick={() => setSelectedLead(lead)}
                      className="flex items-start gap-2.5 w-full text-left px-3 py-2.5 border-none cursor-pointer transition-colors"
                      style={{ background: isSelected ? "var(--color-bg3)" : picked.has(lead._id) ? `${ACCENT}0f` : "transparent", borderBottom: "1px solid var(--color-bg4)" }}
                    >
                      {checkbox(lead._id)}
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
                    </div>
                  );
                })}

                {(filter === "all" || filter === "uncalled") && uncalled.length > 0 && (
                  <>
                    <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold tracking-widest uppercase flex items-center justify-between" style={{ color: "var(--color-text3)" }}>
                      <span>Not called yet</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[9.5px] font-normal lowercase">{uncalled.length} leads</span>
                        <button
                          type="button"
                          disabled={!!run}
                          onClick={() => {
                            const allPicked = uncalled.every((l) => picked.has(l._id));
                            setPicked((p) => {
                              const n = new Set(p);
                              uncalled.forEach((l) => (allPicked ? n.delete(l._id) : n.add(l._id)));
                              return n;
                            });
                          }}
                          className="text-[10px] font-semibold normal-case tracking-normal border-none bg-transparent cursor-pointer p-0"
                          style={{ color: ACCENT }}
                        >
                          {uncalled.every((l) => picked.has(l._id)) ? "Clear" : "Select all"}
                        </button>
                      </span>
                    </div>
                    {uncalled.map((lead) => {
                      const isSelected = selectedLead?._id === lead._id;
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          key={lead._id}
                          onClick={() => setSelectedLead(lead)}
                          className="flex items-start gap-2.5 w-full text-left px-3 py-2.5 border-none cursor-pointer transition-colors"
                          style={{ background: isSelected ? "var(--color-bg3)" : picked.has(lead._id) ? `${ACCENT}0f` : "transparent", borderBottom: "1px solid var(--color-bg4)" }}
                        >
                          {checkbox(lead._id)}
                          <Avatar name={lead.fullName} size="sm" />
                          <div className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-semibold truncate" style={{ color: isSelected ? ACCENT : "var(--color-text)" }}>
                              {lead.fullName}
                            </span>
                            <span className="block text-[11px] truncate mt-0.5" style={{ color: "var(--color-text3)" }}>
                              {[lead.jobTitle, lead.location, lead.phone].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                        </div>
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

          {/* Call the picked leads one after another */}
          {(picked.size > 0 || run) && (
            <div className="flex-shrink-0 border-t p-3 flex flex-col gap-2" style={{ borderColor: "var(--color-bg4)", background: "var(--color-bg2)" }}>
              {run ? (
                <>
                  <div className="flex items-center justify-between text-[12px]">
                    <span style={{ color: "var(--color-text2)" }}>
                      Calling <b style={{ color: "var(--color-text)" }}>{Math.min(run.done + run.failed + 1, run.total)} of {run.total}</b>
                      {run.current && <span style={{ color: "var(--color-text3)" }}> · {run.current}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => { stopRun.current = true; }}
                      className="flex items-center gap-1 text-[11.5px] font-semibold px-2 py-1 rounded-md border-none cursor-pointer"
                      style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
                    >
                      <IconPlayerStop size={12} /> Stop
                    </button>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg4)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${((run.done + run.failed) / run.total) * 100}%`, background: ACCENT }} />
                  </div>
                  <span className="text-[10.5px]" style={{ color: "var(--color-text3)" }}>{run.max > 1 ? `Up to ${run.max} calls at once — the next lead is dialled as soon as a line frees up.` : "One call at a time — your admin set the limit to 1 call at once."}</span>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] flex-1" style={{ color: "var(--color-text2)" }}><b>{picked.size}</b> selected</span>
                  <button type="button" onClick={() => setPicked(new Set())} title="Clear selection" className="flex p-1.5 rounded-md border-none cursor-pointer" style={{ background: "var(--color-bg3)", color: "var(--color-text3)" }}>
                    <IconX size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={callPicked}
                    className="flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer text-white"
                    style={{ background: ACCENT }}
                  >
                    <IconPhoneCall size={14} /> Call selected
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected lead's calls */}
        <div className="flex-1 min-w-0">
          {selectedLead ? (
            <CallConvo
              key={selectedLead._id}
              lead={selectedLead}
              refreshKey={refreshKey}
              onCallStarted={() => {
                // it's been called now: take it off "Not called" right away
                const id = selectedLead._id;
                setOthers((prev) => prev.filter((l) => l._id !== id));
                loadCalls(false);
              }}
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

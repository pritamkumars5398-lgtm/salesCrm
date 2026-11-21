"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  IconAlertTriangle, IconBrandGoogleMaps, IconBrandLinkedin, IconDatabase, IconLoader2, IconRefresh, IconSparkles, IconX,
} from "@tabler/icons-react";
import type { SyncPreview } from "@/server/services/sync-preview.service";

interface Props {
  agentId: string;
  workspaceName?: string;
  /** pre-pick a group (from "Find leads for this group") */
  initialGroupId?: string;
  onStart: (target: { groupId?: string; keyword?: string; locations?: string[]; total?: number }) => void;
  onClose: () => void;
}

type GroupOption = { _id: string; name: string; color: string; kind: "manual" | "smart" };

const SCRAPER_ICON: Record<string, React.ElementType> = {
  "google-maps": IconBrandGoogleMaps,
  linkedin: IconBrandLinkedin,
};

/** "Leads for Solar panel" → "Solar panel": a sensible default search for a group. */
function searchFromGroupName(name: string): string {
  return name.replace(/^\s*(leads?|customers?|clients?)\s+(for|of|from|in)\s+/i, "").trim().slice(0, 80);
}

/** Shown when "Sync Sources" is clicked: what the sync will run, before anything starts. */
export default function SyncPreviewModal({ agentId, workspaceName, initialGroupId, onStart, onClose }: Props) {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useState(initialGroupId || "");
  const [keyword, setKeyword] = useState("");
  // The search that the preview below reflects (applied on blur / Enter, not every key press).
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [places, setPlaces] = useState<string[] | null>(null); // null until the saved places load
  const [defaultPlaces, setDefaultPlaces] = useState<string[]>([]);
  const [newPlace, setNewPlace] = useState("");
  const [total, setTotal] = useState("");
  const [appliedTotal, setAppliedTotal] = useState("");
  const placesChanged = places !== null && places.join("|") !== defaultPlaces.join("|");
  const placesParam = placesChanged && places!.length ? places!.join(",") : "";

  function addPlace() {
    const p = newPlace.trim();
    if (!p || !places) return;
    if (!places.some((x) => x.toLowerCase() === p.toLowerCase())) setPlaces([...places, p].slice(0, 10));
    setNewPlace("");
  }

  useEffect(() => {
    fetch(`/api/lead-groups?agentId=${agentId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: GroupOption[]) => {
        const manual = (Array.isArray(list) ? list : []).filter((g) => g.kind !== "smart");
        setGroups(manual);
        // Picking a group fills the search with its name — usually what you want to find.
        const g = manual.find((x) => x._id === initialGroupId);
        if (g) { const k = searchFromGroupName(g.name); setKeyword(k); setAppliedKeyword(k); }
      })
      .catch(() => setGroups([]));
  }, [agentId, initialGroupId]);

  function pickGroup(id: string) {
    setGroupId(id);
    const g = groups.find((x) => x._id === id);
    const k = g ? searchFromGroupName(g.name) : "";
    setKeyword(k);
    setAppliedKeyword(k);
  }

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError("");
    const q = new URLSearchParams({ agentId });
    if (appliedKeyword) q.set("keyword", appliedKeyword);
    if (placesParam) q.set("locations", placesParam);
    if (appliedTotal) q.set("total", appliedTotal);
    fetch(`/api/apify/preview?${q.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't load the sync preview");
        if (cancelled) return;
        setPreview(data);
        if (data.defaults) {
          setDefaultPlaces((d) => (d.length ? d : data.defaults.locations ?? []));
          setPlaces((p) => p ?? data.defaults.locations ?? []);
        }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the sync preview"); });
    return () => { cancelled = true; };
  }, [agentId, reload, appliedKeyword, placesParam, appliedTotal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const settingsLink = (tab: string) => `/settings/${agentId}?tab=${tab}`;
  const blocked = !preview || preview.blockers.length > 0;
  const runCount = (preview?.apify.scrapers.length ?? 0) + (preview?.llms.filter((l) => l.ready).length ?? 0);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-[min(560px,100%)] flex-col overflow-hidden rounded-2xl border border-bg4 bg-bg2 shadow-xl">
        <div className="flex items-start gap-3 border-b border-bg4 px-5 py-4">
          <IconRefresh size={20} className="mt-0.5 text-text2" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-text">Sync preview{workspaceName ? ` — ${workspaceName}` : ""}</p>
            <p className="text-[12px] leading-relaxed text-text3">This is what will run when you start. Nothing has started yet.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text3"><IconX size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">
              {error}
              <button onClick={() => setReload((n) => n + 1)} className="font-semibold underline">Retry</button>
            </div>
          )}
          {!preview && !error && (
            <p className="flex items-center gap-2 text-[12.5px] text-text3"><IconLoader2 size={14} className="animate-spin" /> Checking sources…</p>
          )}

          <section className="mb-4 flex flex-col gap-2 rounded-xl border border-bg4 bg-bg3/50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text3">What to find (this sync only)</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-text2">Put new leads in group</span>
                <select className="form-input text-[12.5px]" value={groupId} onChange={(e) => pickGroup(e.target.value)}>
                  <option value="">No group (all leads)</option>
                  {groups.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[12px] font-semibold text-text2">Search for</span>
                <input
                  className="form-input text-[12.5px]"
                  placeholder={preview?.defaults?.keyword ? `Usual: ${preview.defaults.keyword}` : "Type of business, e.g. Solar panel dealers"}
                  value={keyword}
                  maxLength={80}
                  onChange={(e) => setKeyword(e.target.value)}
                  onBlur={() => setAppliedKeyword(keyword.trim())}
                  onKeyDown={(e) => { if (e.key === "Enter") setAppliedKeyword(keyword.trim()); }}
                />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-text2">Places to search</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(places ?? []).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full border border-bg4 bg-bg2 px-2.5 py-0.5 text-[12px] text-text">
                    {p}
                    <button type="button" aria-label={`Remove ${p}`} onClick={() => setPlaces((list) => (list ?? []).filter((x) => x !== p))} className="text-text3 hover:text-text"><IconX size={11} /></button>
                  </span>
                ))}
                <input
                  className="form-input w-[140px] py-1 text-[12px]"
                  placeholder="Add a city…"
                  value={newPlace}
                  maxLength={60}
                  onChange={(e) => setNewPlace(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPlace(); } }}
                  onBlur={addPlace}
                />
                {placesChanged && (
                  <button type="button" onClick={() => setPlaces(defaultPlaces)} className="text-[11.5px] font-semibold text-primary">Reset</button>
                )}
              </div>
              {places !== null && places.length === 0 && <span className="text-[11.5px] text-amber-500">Add at least one place, or Reset to your usual places.</span>}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-text2">How many leads (about)</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {["25", "50", "100", "200"].map((n) => (
                  <button key={n} type="button" onClick={() => { setTotal(n); setAppliedTotal(n); }}
                    className={`rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${appliedTotal === n ? "border-[var(--color-primary-light)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-light)]" : "border-bg4 bg-bg2 text-text2"}`}>
                    {n}
                  </button>
                ))}
                <input
                  type="number" min={1} max={500}
                  className="form-input w-[90px] py-1 text-[12px]"
                  placeholder="Usual"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  onBlur={() => setAppliedTotal(total.trim())}
                  onKeyDown={(e) => { if (e.key === "Enter") setAppliedTotal(total.trim()); }}
                />
                {appliedTotal && <button type="button" onClick={() => { setTotal(""); setAppliedTotal(""); }} className="text-[11.5px] font-semibold text-primary">Usual</button>}
              </div>
              <span className="text-[11.5px] text-text3">Split across the places above. Max 500; duplicates and your plan limit still apply.</span>
            </label>
            <p className="text-[11.5px] text-text3">
              {groupId ? "New leads go straight into this group. " : ""}
              {appliedKeyword ? `Searching for "${appliedKeyword}".` : "Leave the search empty to use your usual business type."} Changes here apply to this sync only.
            </p>
            {groups.length === 0 && <p className="text-[11.5px] text-text3">No groups yet — create one in Settings → Leads → Groups.</p>}
          </section>

          {preview && (
            <div className="flex flex-col gap-4">
              {preview.blockers.map((b) => (
                <p key={b} className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">
                  <IconAlertTriangle size={15} className="mt-0.5 flex-shrink-0" />{b}
                </p>
              ))}

              <section>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text3">Lead search</p>
                  <Link href={settingsLink("apify")} onClick={onClose} className="text-[11.5px] font-semibold text-primary">Edit</Link>
                </div>
                {!preview.apify.enabled ? (
                  <p className="text-[12.5px] text-text3">Turned off for this workspace.</p>
                ) : (
                  <>
                    {!preview.apify.tokenSet && <p className="mb-1.5 text-[12px] text-amber-500">API token missing — these won&apos;t start until it&apos;s added.</p>}
                    {preview.apify.scrapers.length === 0 && <p className="text-[12.5px] text-text3">No scraper is set up.</p>}
                    <div className="flex flex-col gap-1.5">
                      {preview.apify.scrapers.map((s, i) => {
                        const Icon = SCRAPER_ICON[s.scraperType] ?? IconDatabase;
                        return (
                          <div key={i} className="flex items-center gap-2.5 rounded-lg border border-bg4 px-3 py-2">
                            <Icon size={16} className="flex-shrink-0 text-text2" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12.5px] font-semibold text-text">{s.search}</p>
                              <p className="truncate font-mono text-[10.5px] text-text3">{s.actorId}</p>
                            </div>
                            <span className="whitespace-nowrap text-[11.5px] text-text2">{s.maxResults ? `up to ${s.maxResults}` : "default"}</span>
                          </div>
                        );
                      })}
                    </div>
                    {preview.apify.skipped.length > 0 && (
                      <p className="mt-1.5 text-[11.5px] text-text3">Not running: {preview.apify.skipped.map((s) => s.reason).join(" · ")}</p>
                    )}
                    {preview.filterSummary && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-text2">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex-shrink-0">Ideal Customer Filter:</span>
                        <span className="text-text3">{preview.filterSummary}</span>
                      </div>
                    )}
                  </>
                )}
              </section>

              <section>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text3">AI lead sources</p>
                  <Link href={settingsLink("llm-scraper")} onClick={onClose} className="text-[11.5px] font-semibold text-primary">Edit</Link>
                </div>
                {preview.llms.length === 0 ? (
                  <p className="text-[12.5px] text-text3">None turned on.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {preview.llms.map((l) => (
                      <div key={l.type} className="flex items-center gap-2.5 rounded-lg border border-bg4 px-3 py-2">
                        <IconSparkles size={16} className="flex-shrink-0 text-text2" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-semibold text-text">{l.label}</p>
                          {l.model && <p className="truncate text-[11px] text-text3">{l.model}</p>}
                        </div>
                        <span className={`text-[11.5px] font-semibold ${l.ready ? "text-emerald-500" : "text-red-500"}`}>{l.ready ? "Ready" : l.problem}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-bg3 px-2 py-2">
                  <p className="text-[16px] font-bold text-text">{preview.apify.scrapers.length ? `≤ ${preview.maxNewLeads}` : "—"}</p>
                  <p className="text-[10.5px] text-text3">new leads from lead search</p>
                </div>
                <div className="rounded-lg bg-bg3 px-2 py-2">
                  <p className="text-[16px] font-bold text-text">{preview.quota.remaining === null ? "Unlimited" : preview.quota.remaining}</p>
                  <p className="text-[10.5px] text-text3">left this month{preview.quota.limit !== -1 ? ` (${preview.quota.used}/${preview.quota.limit} used)` : ""}</p>
                </div>
                <div className="rounded-lg bg-bg3 px-2 py-2">
                  <p className="text-[16px] font-bold text-text">{preview.existingLeads}</p>
                  <p className="text-[10.5px] text-text3">leads already here</p>
                </div>
              </section>
              <p className="-mt-2 text-[11.5px] text-text3">Leads whose phone or email is already in this workspace are skipped.</p>

              {preview.warnings.length > 0 && (
                <div className="flex flex-col gap-1">
                  {preview.warnings.map((w) => (
                    <p key={w} className="flex gap-2 text-[12px] text-amber-500"><IconAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-bg4 px-5 py-3">
          {preview?.quota.remaining === 0 && (
            <Link href={`/plans/${agentId}`} onClick={onClose} className="mr-auto text-[12.5px] font-semibold text-primary">Upgrade plan</Link>
          )}
          <button onClick={onClose} className="rounded-lg border border-bg4 px-3 py-2 text-[12.5px] font-semibold text-text2">Cancel</button>
          <button
            onClick={() => onStart({
              groupId: groupId || undefined,
              keyword: keyword.trim() || undefined,
              locations: placesChanged && places?.length ? places : undefined,
              total: appliedTotal ? Number(appliedTotal) : undefined,
            })}
            disabled={blocked || (places !== null && places.length === 0)}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-light))" }}>
            <IconRefresh size={14} /> Start sync{runCount ? ` (${runCount} run${runCount === 1 ? "" : "s"})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

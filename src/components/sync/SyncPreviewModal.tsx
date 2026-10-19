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
  onStart: () => void;
  onClose: () => void;
}

const SCRAPER_ICON: Record<string, React.ElementType> = {
  "google-maps": IconBrandGoogleMaps,
  linkedin: IconBrandLinkedin,
};

/** Shown when "Sync Sources" is clicked: what the sync will run, before anything starts. */
export default function SyncPreviewModal({ agentId, workspaceName, onStart, onClose }: Props) {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError("");
    fetch(`/api/apify/preview?agentId=${agentId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't load the sync preview");
        if (!cancelled) setPreview(data);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the sync preview"); });
    return () => { cancelled = true; };
  }, [agentId, reload]);

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

          {preview && (
            <div className="flex flex-col gap-4">
              {preview.blockers.map((b) => (
                <p key={b} className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">
                  <IconAlertTriangle size={15} className="mt-0.5 flex-shrink-0" />{b}
                </p>
              ))}

              <section>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-text3">Apify scrapers</p>
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
                          <p className="truncate text-[11px] text-text3">{l.model || "no model"}</p>
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
                  <p className="text-[10.5px] text-text3">new leads from Apify</p>
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
          <button onClick={onStart} disabled={blocked}
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

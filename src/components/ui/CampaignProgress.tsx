"use client";
import { useEffect, useRef, useState } from "react";
import { IconCheck, IconAlertTriangle, IconRefresh, IconX, IconLoader2 } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { getCampaign, retryCampaign } from "@/lib/api/campaigns.api";

const POLL_MS = 2500;

/**
 * Topbar widget showing live progress of the active outreach campaign
 * (started by Publish or Retry), with a results panel listing per-lead
 * failures and a "Retry failed" action.
 */
export default function CampaignProgress() {
  const activeCampaign = useAppStore((s) => s.activeCampaign);
  const panelOpen = useAppStore((s) => s.campaignPanelOpen);
  const setActiveCampaign = useAppStore((s) => s.setActiveCampaign);
  const setPanelOpen = useAppStore((s) => s.setCampaignPanelOpen);
  const showToast = useAppStore((s) => s.showToast);

  const [retrying, setRetrying] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const doneToastShown = useRef<string | null>(null);

  const isActive = activeCampaign && (activeCampaign.status === "pending" || activeCampaign.status === "running");

  // Poll while the campaign is in flight.
  useEffect(() => {
    if (!activeCampaign || !isActive) return;
    const id = activeCampaign._id;
    const timer = setInterval(async () => {
      try {
        const fresh = await getCampaign(id);
        setActiveCampaign(fresh);
        if ((fresh.status === "completed" || fresh.status === "failed") && doneToastShown.current !== id) {
          doneToastShown.current = id;
          if (fresh.failed > 0) {
            showToast(`Outreach finished: ${fresh.sent} sent, ${fresh.failed} failed — click the campaign chip for details.`, "error");
          } else {
            showToast(`Outreach finished: all ${fresh.sent} messages sent!`, "success");
          }
        }
      } catch { /* transient poll error — keep trying */ }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [activeCampaign?._id, isActive, setActiveCampaign, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close panel on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [setPanelOpen]);

  if (!activeCampaign) return null;

  const done = activeCampaign.sent + activeCampaign.failed + activeCampaign.skipped;
  const hasFailures = activeCampaign.failed > 0;

  async function handleRetry() {
    if (!activeCampaign || retrying) return;
    setRetrying(true);
    doneToastShown.current = null;
    try {
      const fresh = await retryCampaign(activeCampaign._id);
      setActiveCampaign(fresh);
      showToast(`Retrying ${activeCampaign.failed} failed lead${activeCampaign.failed !== 1 ? "s" : ""}…`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Retry failed", "error");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] sm:text-[11px] font-semibold cursor-pointer transition-all duration-150 bg-bg2 hover:bg-bg3"
        style={{
          borderColor: isActive ? "rgba(99,102,241,0.3)" : hasFailures ? "rgba(239,68,68,0.3)" : "rgba(34,201,122,0.3)",
          color: isActive ? "#6366f1" : hasFailures ? "#ef4444" : "#22c97a",
        }}
        title="Outreach campaign status"
      >
        {isActive && done < activeCampaign.total ? (
          <>
            <IconLoader2 size={12} className="animate-spin" />
            <span>Sending {done}/{activeCampaign.total}</span>
            {hasFailures && <span className="text-red-500">· {activeCampaign.failed} failed</span>}
          </>
        ) : isActive ? (
          <>
            {hasFailures ? <IconAlertTriangle size={12} /> : <IconCheck size={12} />}
            <span>Wrapping up… {done}/{activeCampaign.total}</span>
          </>
        ) : hasFailures ? (
          <>
            <IconAlertTriangle size={12} />
            <span>{activeCampaign.sent} sent · {activeCampaign.failed} failed</span>
          </>
        ) : (
          <>
            <IconCheck size={12} />
            <span>{activeCampaign.sent} sent</span>
          </>
        )}
      </button>

      {panelOpen && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-xl border bg-bg2 shadow-lg z-50 overflow-hidden"
          style={{ borderColor: "#e2e8f0" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#f1f5f9" }}>
            <div>
              <p className="text-[12px] font-bold text-text m-0">Outreach campaign</p>
              <p className="text-[11px] text-text3 m-0 mt-0.5">
                {isActive ? "In progress…" : "Finished"} · {activeCampaign.sent} sent
                {activeCampaign.failed > 0 && <span className="text-red-500"> · {activeCampaign.failed} failed</span>}
                {activeCampaign.skipped > 0 && ` · ${activeCampaign.skipped} skipped`}
                {" of "}{activeCampaign.total}
              </p>
            </div>
            <button
              onClick={() => { setActiveCampaign(null); setPanelOpen(false); }}
              className="p-1 rounded text-text3 hover:text-text2 hover:bg-bg3 border-none bg-transparent cursor-pointer"
              title="Dismiss"
            >
              <IconX size={14} />
            </button>
          </div>

          {/* progress bar */}
          <div className="px-4 pt-3">
            <div className="h-1.5 rounded-full bg-bg3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${activeCampaign.total > 0 ? Math.round((done / activeCampaign.total) * 100) : 0}%`,
                  background: hasFailures ? "linear-gradient(90deg,#6366f1,#ef4444)" : "#6366f1",
                }}
              />
            </div>
          </div>

          {activeCampaign.failures.length > 0 && (
            <div className="px-4 py-3 max-h-52 overflow-y-auto">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text3 mb-2">Failed leads</p>
              {activeCampaign.failures.map((e, i) => (
                <div key={`${e.leadId}-${i}`} className="mb-2">
                  <p className="text-[12px] font-semibold text-text2 m-0">{e.leadName || "Unknown lead"}</p>
                  <p className="text-[11px] text-red-500 m-0 mt-0.5 break-words">{e.reason}</p>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: "#f1f5f9" }}>
            {!isActive && hasFailures && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white border-none cursor-pointer"
                style={{ background: "#df2a2a", opacity: retrying ? 0.7 : 1 }}
              >
                <IconRefresh size={13} className={retrying ? "animate-spin" : ""} />
                Retry {activeCampaign.failed} failed
              </button>
            )}
            <button
              onClick={() => setPanelOpen(false)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-bg4 bg-bg2 text-text2 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

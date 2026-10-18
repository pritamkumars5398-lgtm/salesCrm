"use client";
import { IconX, IconRefresh, IconCheck, IconAlertCircle, IconDownload } from "@tabler/icons-react";

export interface SyncRun {
  runId: string;
  search: string;
  scraperType: string;
  status: "starting" | "polling" | "importing" | "done" | "failed";
  itemCount: number;
  imported: number;
  error?: string;
}
// df
interface Props {
  runs: SyncRun[];
  /** the sync flow is still working (starting, polling or importing) */
  syncing: boolean;
  /** why nothing ran, when that's the outcome */
  note?: string | null;
  open: boolean;
  onClose: () => void;
  onCancel?: (runId: string) => void;
}

const STATUS_CFG: Record<SyncRun["status"], { label: string; color: string; bg: string; spin?: boolean }> = {
  starting: { label: "Starting…", color: "#6366f1", bg: "rgba(99,102,241,0.1)", spin: true },
  polling: { label: "Scraping…", color: "#f5a623", bg: "rgba(245,166,35,0.1)", spin: true },
  importing: { label: "Importing…", color: "#4dabf7", bg: "rgba(77,171,247,0.1)", spin: true },
  done: { label: "Done", color: "#22c97a", bg: "rgba(34,201,122,0.1)" },
  failed: { label: "Failed", color: "#ff6b6b", bg: "rgba(255,107,107,0.1)" },
};

const SCRAPER_COLOR: Record<string, string> = {
  "google-maps": "#10b981",
  linkedin: "#0a66c2",
  justdial: "#f58220",
  custom: "#6366f1",
};

export default function SyncPanel({ runs, syncing, note, open, onClose, onCancel }: Props) {
  if (!open) return null;

  // Finished when the flow says so — not only when runs exist, or a sync that
  // never started a run would spin on "Starting scrapers…" forever.
  const allDone = !syncing;
  const totalNew = runs.reduce((s, r) => s + r.imported, 0);
  const anyFailed = runs.some((r) => r.status === "failed");
  const title = !allDone
    ? "Syncing lead sources…"
    : runs.length === 0
      ? "Nothing was synced"
      : totalNew > 0
        ? `Done — ${totalNew} lead${totalNew === 1 ? "" : "s"} imported`
        : anyFailed ? "Sync finished with problems" : "Sync complete — no new leads";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 60,
        width: 360,
        borderRadius: 16,
        background: "var(--color-bg2)",
        border: "1px solid var(--color-bg4)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 16px",
          borderBottom: "1px solid var(--color-bg4)",
          background: "var(--color-bg3)",
        }}
      >
        {allDone && runs.length === 0 ? (
          <IconAlertCircle size={16} style={{ color: "#ff6b6b" }} />
        ) : (
          <IconRefresh
            size={16}
            style={{
              color: "#6366f1",
              animation: !allDone ? "spin 1s linear infinite" : "none",
            }}
          />
        )}
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)", flex: 1 }}>
          {title}
        </span>
        {/* Closing only hides the panel — a running sync keeps going in the background. */}
          <button
            onClick={onClose}
            title={allDone ? "Close" : "Hide (the sync keeps running)"}
            style={{
              padding: 4, border: "none", background: "transparent",
              color: "var(--color-text3)", cursor: "pointer", borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <IconX size={15} />
          </button>
      </div>

      {/* Runs list */}
      <div style={{ padding: "10px 0" }}>
        {runs.length === 0 && (
          <div style={{ padding: "16px 16px", fontSize: 12.5, color: note ? "#ff6b6b" : "var(--color-text3)", lineHeight: 1.5 }}>
            {note ?? (syncing ? "Starting scrapers…" : "No scraper ran.")}
          </div>
        )}
        {runs.length > 0 && note && (
          <div style={{ padding: "8px 16px", fontSize: 12, color: "#ff6b6b", lineHeight: 1.5 }}>{note}</div>
        )}
        {runs.map((run) => {
          const cfg = STATUS_CFG[run.status];
          const dot = SCRAPER_COLOR[run.scraperType] ?? "#6366f1";
          return (
            <div
              key={run.runId}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 16px",
                borderBottom: "1px solid var(--color-bg4)",
              }}
            >
              {/* Scraper color dot */}
              <span style={{
                marginTop: 3, width: 8, height: 8, borderRadius: "50%",
                background: dot, flexShrink: 0,
                boxShadow: run.status !== "done" && run.status !== "failed"
                  ? `0 0 0 3px ${dot}33` : "none",
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Search label */}
                <p style={{
                  fontSize: 12.5, fontWeight: 600, color: "var(--color-text)",
                  margin: "0 0 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {run.search}
                </p>

                {/* Status row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 10.5, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 99,
                    background: cfg.bg, color: cfg.color,
                  }}>
                    {cfg.spin && (
                      <span style={{
                        display: "inline-block", width: 8, height: 8,
                        border: `1.5px solid ${cfg.color}44`,
                        borderTopColor: cfg.color,
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }} />
                    )}
                    {run.status === "done" && <IconCheck size={10} />}
                    {run.status === "failed" && <IconAlertCircle size={10} />}
                    {cfg.label}
                  </span>

                  {run.itemCount > 0 && (
                    <span style={{ fontSize: 11, color: "var(--color-text3)" }}>
                      {run.itemCount} found
                    </span>
                  )}
                  {run.imported > 0 && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 11, color: "#22c97a", fontWeight: 600,
                    }}>
                      <IconDownload size={10} /> {run.imported} new
                    </span>
                  )}

                  {cfg.spin && onCancel && (
                    <button
                      onClick={() => onCancel(run.runId)}
                      disabled={run.error === "Cancelling..."}
                      style={{
                        marginLeft: "auto",
                        background: "transparent",
                        border: "none",
                        color: run.error === "Cancelling..." ? "var(--color-text3)" : "#ff6b6b",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: run.error === "Cancelling..." ? "not-allowed" : "pointer",
                        padding: "2px 6px",
                        borderRadius: 6,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        if (run.error !== "Cancelling...") {
                          e.currentTarget.style.background = "rgba(255,107,107,0.1)";
                        }
                      }}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      {run.error === "Cancelling..." ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                </div>

                {run.error && run.error !== "Cancelling..." && (
                  <p style={{ fontSize: 11, color: "#ff6b6b", margin: "4px 0 0", lineHeight: 1.4 }}>
                    {run.error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline spin keyframe (only works in browser with <style>) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

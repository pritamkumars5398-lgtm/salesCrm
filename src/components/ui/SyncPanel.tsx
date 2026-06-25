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

interface Props {
  runs: SyncRun[];
  open: boolean;
  onClose: () => void;
}

const STATUS_CFG: Record<SyncRun["status"], { label: string; color: string; bg: string; spin?: boolean }> = {
  starting:  { label: "Starting…",  color: "#6366f1", bg: "rgba(99,102,241,0.1)", spin: true },
  polling:   { label: "Scraping…",  color: "#f5a623", bg: "rgba(245,166,35,0.1)", spin: true },
  importing: { label: "Importing…", color: "#4dabf7", bg: "rgba(77,171,247,0.1)", spin: true },
  done:      { label: "Done",       color: "#22c97a", bg: "rgba(34,201,122,0.1)" },
  failed:    { label: "Failed",     color: "#ff6b6b", bg: "rgba(255,107,107,0.1)" },
};

const SCRAPER_COLOR: Record<string, string> = {
  "google-maps": "#10b981",
  linkedin:      "#0a66c2",
  justdial:      "#f58220",
  custom:        "#6366f1",
};

export default function SyncPanel({ runs, open, onClose }: Props) {
  if (!open) return null;

  const allDone  = runs.length > 0 && runs.every((r) => r.status === "done" || r.status === "failed");
  const totalNew = runs.reduce((s, r) => s + r.imported, 0);

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
        <IconRefresh
          size={16}
          style={{
            color: "#6366f1",
            animation: !allDone ? "spin 1s linear infinite" : "none",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)", flex: 1 }}>
          {allDone ? (totalNew > 0 ? `Done — ${totalNew} leads imported` : "Sync complete") : "Apify Sync Running…"}
        </span>
        {allDone && (
          <button
            onClick={onClose}
            style={{
              padding: 4, border: "none", background: "transparent",
              color: "var(--color-text3)", cursor: "pointer", borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <IconX size={15} />
          </button>
        )}
      </div>

      {/* Runs list */}
      <div style={{ padding: "10px 0" }}>
        {runs.length === 0 && (
          <div style={{ padding: "16px 16px", fontSize: 12.5, color: "var(--color-text3)" }}>
            Starting scrapers…
          </div>
        )}
        {runs.map((run) => {
          const cfg  = STATUS_CFG[run.status];
          const dot  = SCRAPER_COLOR[run.scraperType] ?? "#6366f1";
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
                    {run.status === "done"   && <IconCheck size={10} />}
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
                </div>

                {run.error && (
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

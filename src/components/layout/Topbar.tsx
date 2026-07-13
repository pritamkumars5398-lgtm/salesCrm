"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  IconPlus, IconRefresh, IconMenu2, IconChevronDown, IconAlertTriangle,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { useIsMobile } from "@/hooks/useMediaQuery";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { avatarColor, getInitials } from "@/lib/utils/avatar";
import { PAGE_TITLES } from "@/lib/constants/pages";
import { publishAgent, updateAgentStatus } from "@/lib/api/agents.api";
import { getActiveCampaigns } from "@/lib/api/campaigns.api";
import { ApiError } from "@/lib/api/client";
import CampaignProgress from "@/components/ui/CampaignProgress";

interface Props {
  onAddLead: () => void;
  onSyncApify: () => void;
  syncing?: boolean;
}

export default function Topbar({ onAddLead, onSyncApify, syncing }: Props) {
  const router = useRouter();
  const {
    currentPage, activeAgent, userName,
    sidebarOpenMobile, setSidebarOpenMobile,
    sidebarCollapsed, setSidebarCollapsed,
    updateAgent, showToast, cronJobs, setCronJobs, setActiveCampaign,
  } = useAppStore();

  const isMobile = useIsMobile();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Click-outside to close status menu (preserved exactly) ───
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Resume campaign progress (preserved exactly) ─────────────
  useEffect(() => {
    if (!activeAgent) return;
    let cancelled = false;
    getActiveCampaigns(activeAgent._id)
      .then((campaigns) => {
        if (!cancelled && campaigns.length > 0) setActiveCampaign(campaigns[0]);
      })
      .catch(() => { /* no campaign to resume */ });
    return () => { cancelled = true; };
  }, [activeAgent?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Business logic handlers (preserved exactly) ──────────────
  async function handlePublish() {
    if (!activeAgent || updatingStatus) return;
    setUpdatingStatus(true);
    setPublishIssues([]);
    try {
      const res = await publishAgent(activeAgent._id);
      updateAgent(activeAgent._id, { status: "active" });
      setCronJobs(cronJobs.map((c) => ({ ...c, enabled: true })));
      setStatusMenuOpen(false);
      if (res.schedules && res.schedules > 0) {
        showToast(`Agent published — ${res.schedules} schedule${res.schedules !== 1 ? "s" : ""} armed. Outreach runs at the scheduled times.`, "success");
      } else {
        showToast("Agent published successfully!", "success");
      }
      (res.warnings ?? []).forEach((w) => showToast(w, "error"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const payload = err.payload as { issues?: string[] };
        setPublishIssues(payload.issues ?? ["Configuration is incomplete."]);
        showToast("Fix the configuration issues below before publishing.", "error");
      } else {
        showToast(err instanceof Error ? err.message : "Error publishing agent.", "error");
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleUnpublish() {
    if (!activeAgent || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await updateAgentStatus(activeAgent._id, "inactive");
      updateAgent(activeAgent._id, { status: "inactive" });
      setCronJobs(cronJobs.map((c) => ({ ...c, enabled: false })));
      showToast("Agent unpublished/paused.", "success");
      setStatusMenuOpen(false);
      setPublishIssues([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error updating agent status.", "error");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const initials = getInitials(userName || "U");
  const bgColor = avatarColor(userName || "U");
  const isPublished = activeAgent?.status === "active";
  const pageTitle = PAGE_TITLES[currentPage] ?? currentPage;

  return (
    <header
      className="sticky top-0 z-20 flex h-[54px] shrink-0 items-center justify-between gap-2 border-b border-bg4 bg-bg2/95 px-3 backdrop-blur-md sm:px-5"
    >
      {/* ── Left: Hamburger + Title ── */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        {/* Hamburger menu button */}
        <button
          onClick={() => isMobile ? setSidebarOpenMobile(true) : setSidebarCollapsed(!sidebarCollapsed)}
          aria-label="Toggle sidebar"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 6,
            borderRadius: "var(--radius-md)",
            transition: "background var(--transition-fast)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
        >
          <IconMenu2 size={18} />
        </button>

        {/* Page breadcrumb */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="truncate text-[14px] font-semibold text-text"
            style={{ letterSpacing: "-0.01em" }}
          >
            {pageTitle}
          </span>
          {/* {activeAgent && (
            <>
              <span style={{ fontSize: 14, color: "var(--color-bg5)", fontWeight: 300 }}>/</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--color-text3)",
                  fontFamily: "var(--font-mono)",
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeAgent.name}
              </span>
            </>
          )} */}
        </div>
      </div>

      {/* ── Right: Actions ── */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Campaign progress widget — too wide for phones */}
        <div className="hidden md:flex">
          <CampaignProgress />
        </div>

        {/* Agent status pill + dropdown */}
        {activeAgent && (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: "var(--radius-full)",
                border: `1px solid ${isPublished ? "rgba(16,185,129,0.25)" : "rgba(148,163,184,0.3)"}`,
                background: isPublished ? "var(--color-green-bg)" : "var(--color-bg3)",
                color: isPublished ? "var(--color-green)" : "var(--color-text3)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.02em",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                userSelect: "none",
              }}
            >
              {/* Animated live dot when published */}
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {isPublished && (
                  <span
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: "var(--color-green)",
                      animation: "pulse-ring 1.4s ease-out infinite",
                    }}
                  />
                )}
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: isPublished ? "var(--color-green)" : "var(--color-text4)",
                    display: "block",
                    position: "relative",
                  }}
                />
              </span>
              {isPublished ? "Published" : "Draft"}
              <IconChevronDown
                size={12}
                style={{
                  transition: "transform 200ms ease",
                  transform: statusMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {/* Dropdown */}
            {statusMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: "min(272px, calc(100vw - 24px))",
                  borderRadius: "var(--radius-xl)",
                  background: "var(--color-bg2)",
                  border: "1px solid var(--color-bg4)",
                  boxShadow: "var(--shadow-xl)",
                  padding: 8,
                  zIndex: 50,
                  animation: "slideDown 200ms ease both",
                }}
              >
                {/* Description */}
                <div style={{ padding: "8px 10px 6px" }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text4)", margin: "0 0 4px" }}>
                    Agent Visibility
                  </p>
                  <p style={{ fontSize: 12.5, color: "var(--color-text2)", margin: 0, lineHeight: 1.5 }}>
                    {isPublished
                      ? "Your agent is Published. Automated schedules and outreach are active."
                      : "Your agent is in Draft. Outreach runs are paused."}
                  </p>
                </div>

                {/* Issues */}
                {publishIssues.length > 0 && (
                  <div
                    style={{
                      margin: "6px 4px",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-lg)",
                      background: "var(--color-red-bg)",
                      border: "1px solid rgba(239,68,68,0.2)",
                    }}
                  >
                    <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-red)", margin: "0 0 5px", display: "flex", alignItems: "center", gap: 5 }}>
                      <IconAlertTriangle size={12} /> Fix before publishing
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 14 }}>
                      {publishIssues.map((issue, i) => (
                        <li key={i} style={{ fontSize: 12, color: "var(--color-red)", lineHeight: 1.6 }}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ height: 1, background: "var(--color-bg3)", margin: "6px 0" }} />

                {/* Publish option */}
                <button
                  disabled={updatingStatus || isPublished}
                  onClick={handlePublish}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "var(--radius-lg)",
                    border: "none",
                    cursor: isPublished ? "default" : "pointer",
                    background: isPublished ? "var(--color-green-bg)" : "transparent",
                    transition: "background var(--transition-fast)",
                    textAlign: "left",
                    opacity: updatingStatus ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => { if (!isPublished) (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)"; }}
                  onMouseLeave={(e) => { if (!isPublished) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-green)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text)", margin: "0 0 1px" }}>Publish Agent</p>
                    <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>Go live & start outreach</p>
                  </div>
                  {isPublished && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-green)" }}>Active</span>}
                </button>

                {/* Unpublish option */}
                <button
                  disabled={updatingStatus || !isPublished}
                  onClick={handleUnpublish}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "var(--radius-lg)",
                    border: "none",
                    cursor: !isPublished ? "default" : "pointer",
                    background: !isPublished ? "var(--color-bg3)" : "transparent",
                    transition: "background var(--transition-fast)",
                    textAlign: "left",
                    opacity: updatingStatus ? 0.7 : 1,
                  }}
                  onMouseEnter={(e) => { if (isPublished) (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)"; }}
                  onMouseLeave={(e) => { if (isPublished) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-text4)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text)", margin: "0 0 1px" }}>Unpublish (Draft)</p>
                    <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>Pause all campaigns & crons</p>
                  </div>
                  {!isPublished && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text4)" }}>Draft</span>}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Add Lead */}
        <button
          onClick={onAddLead}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: "var(--radius-lg)",
            background: "var(--color-bg2)",
            border: "1px solid var(--color-bg4)",
            color: "var(--color-text2)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all var(--transition-fast)",
            boxShadow: "var(--shadow-xs)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-bg5)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg2)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-bg4)";
          }}
        >
          <IconPlus size={14} />
          <span className="hidden sm:inline">Add lead</span>
        </button>

        {/* Sync Apify */}
        <button
          onClick={onSyncApify}
          disabled={syncing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: "var(--radius-lg)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-light))",
            border: "none",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: syncing ? "not-allowed" : "pointer",
            opacity: syncing ? 0.75 : 1,
            transition: "all var(--transition-fast)",
            boxShadow: syncing ? "none" : "var(--shadow-primary)",
          }}
          onMouseEnter={(e) => {
            if (!syncing) (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-primary-lg)";
          }}
          onMouseLeave={(e) => {
            if (!syncing) (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-primary)";
          }}
        >
          <IconRefresh size={14} className={syncing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync Apify"}</span>
          <span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
        </button>

        <ThemeToggle />

        {/* Profile avatar */}
        <button
          onClick={() => router.push(`/profile/${activeAgent?._id || "default"}`)}
          title={`${userName} — View profile`}
          aria-label={`Profile: ${userName}`}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: bgColor,
            border: currentPage === "profile" ? `2px solid ${bgColor}` : "2px solid transparent",
            boxShadow: currentPage === "profile" ? `0 0 0 2px ${bgColor}44` : "none",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "box-shadow var(--transition-fast), border-color var(--transition-fast)",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 3px ${bgColor}44`)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = currentPage === "profile" ? `0 0 0 2px ${bgColor}44` : "none")}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}

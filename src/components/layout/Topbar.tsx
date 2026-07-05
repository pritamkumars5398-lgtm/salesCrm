"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconRefresh, IconMenu2, IconChevronDown, IconAlertTriangle } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
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
  const { currentPage, activeAgent, userName, setSidebarOpenMobile, updateAgent, showToast, cronJobs, setCronJobs, setActiveCampaign } = useAppStore();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Resume progress display if this agent already has a campaign in flight
  // (e.g. after a page reload while sending).
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
  const bgColor  = avatarColor(userName || "U");

  const isPublished = activeAgent?.status === "active";

  return (
    <header
      className="flex items-center justify-between px-4 sm:px-6 flex-shrink-0 z-20 border-b"
      style={{
        height: 54,
        background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)",
        borderColor: "#e2e8f0",
      }}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Hamburger Menu Icon */}
        <button
          onClick={() => setSidebarOpenMobile(true)}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 border-none bg-transparent cursor-pointer md:hidden flex items-center justify-center"
        >
          <IconMenu2 size={18} />
        </button>

        <span className="text-[13px] sm:text-[14px] font-medium">{PAGE_TITLES[currentPage] ?? currentPage}</span>
        {activeAgent && (
          <span className="text-[11px] sm:text-[12px] font-mono truncate max-w-[100px] sm:max-w-none" style={{ color: "var(--color-text3)" }}>
            / {activeAgent.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        <CampaignProgress />
        {activeAgent && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase cursor-pointer transition-all duration-150 select-none bg-white hover:bg-slate-50"
              style={{
                borderColor: isPublished ? "rgba(34, 201, 122, 0.2)" : "rgba(148, 163, 184, 0.2)",
                color: isPublished ? "#22c97a" : "#64748b",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{
                  background: isPublished ? "#22c97a" : "#94a3b8",
                }}
              />
              <span>{isPublished ? "Published" : "Draft"}</span>
              <IconChevronDown size={12} className={`transition-transform duration-200 ${statusMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {statusMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-64 rounded-xl border bg-white p-3 shadow-lg z-50 flex flex-col gap-2 transition-all duration-150"
                style={{
                  borderColor: "#e2e8f0",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
                }}
              >
                <div className="px-2 py-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 m-0">Agent Visibility</p>
                  <p className="text-[12px] text-slate-600 mt-1 mb-0 leading-normal">
                    {isPublished
                      ? "Your agent is currently Published. Automated schedules and manual outreach are active."
                      : "Your agent is currently in Draft (Unpublished). Outreach runs are paused."}
                  </p>
                </div>

                {publishIssues.length > 0 && (
                  <div className="mx-1 px-3 py-2 rounded-lg" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-500 m-0 flex items-center gap-1">
                      <IconAlertTriangle size={11} /> Fix before publishing
                    </p>
                    <ul className="m-0 mt-1 pl-4 text-[11px] text-red-600 leading-relaxed">
                      {publishIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                    </ul>
                  </div>
                )}

                <div className="border-t my-1" style={{ borderColor: "#f1f5f9" }} />

                <button
                  disabled={updatingStatus || isPublished}
                  onClick={handlePublish}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[13px] font-medium border-none cursor-pointer transition-all duration-150 w-full bg-transparent ${
                    isPublished
                      ? "text-emerald-700 font-semibold bg-emerald-50/50"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ background: "#22c97a" }}
                  />
                  <div className="flex-1">
                    <p className="font-semibold m-0 leading-none text-slate-800 text-[12px]">Publish Agent</p>
                    <p className="text-[10px] text-slate-400 m-0 mt-1 font-normal">Go live & start outreach</p>
                  </div>
                  {isPublished && (
                    <span className="text-[10px] font-bold text-emerald-600 shrink-0">Active</span>
                  )}
                </button>

                <button
                  disabled={updatingStatus || !isPublished}
                  onClick={handleUnpublish}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[13px] font-medium border-none cursor-pointer transition-all duration-150 w-full bg-transparent ${
                    !isPublished
                      ? "text-slate-500 font-semibold bg-slate-50"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ background: "#94a3b8" }}
                  />
                  <div className="flex-1">
                    <p className="font-semibold m-0 leading-none text-slate-800 text-[12px]">Unpublish (Draft)</p>
                    <p className="text-[10px] text-slate-400 m-0 mt-1 font-normal">Pause all campaigns & crons</p>
                  </div>
                  {!isPublished && (
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">Draft</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        <button
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-700 transition-all duration-150 hover:bg-slate-50"
          onClick={onAddLead}
        >
          <IconPlus size={14} />
          <span className="hidden sm:inline">Add lead</span>
        </button>

        <button
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 rounded-lg text-[12px] font-semibold text-white transition-all duration-150"
          style={{
            background: "linear-gradient(135deg, #4f46e5, #6366f1)",
            border: "none",
            opacity: syncing ? 0.7 : 1,
            cursor: syncing ? "not-allowed" : "pointer",
          }}
          onClick={onSyncApify}
          disabled={syncing}
        >
          <IconRefresh size={14} className={syncing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync Apify"}</span>
          <span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
        </button>

        {/* Profile avatar — navigates to profile page */}
        <button
          onClick={() => router.push(`/profile/${activeAgent?._id || "default"}`)}
          title={`${userName} — View profile`}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: bgColor,
            border: currentPage === "profile" ? "2px solid #6366f1" : "2px solid transparent",
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color 0.15s, box-shadow 0.15s",
            outline: "none",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 3px ${bgColor}33`)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.boxShadow = "none")}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}

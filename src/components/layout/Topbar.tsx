"use client";
import { useRouter } from "next/navigation";
import { IconPlus, IconRefresh, IconMenu2 } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { avatarColor, getInitials } from "@/lib/utils/avatar";
import { PAGE_TITLES } from "@/lib/constants/pages";

interface Props {
  onAddLead: () => void;
  onSyncApify: () => void;
  syncing?: boolean;
}

export default function Topbar({ onAddLead, onSyncApify, syncing }: Props) {
  const router = useRouter();
  const { currentPage, activeAgent, userName, setSidebarOpenMobile } = useAppStore();

  const initials = getInitials(userName || "U");
  const bgColor  = avatarColor(userName || "U");

  return (
    <header
      className="flex items-center justify-between px-4 sm:px-6 flex-shrink-0 z-10 border-b"
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-50 text-emerald-600 text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase">
          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full inline-block" style={{ background: "#22c97a" }} />
          <span className="hidden xs:inline">Agent running</span>
          <span className="xs:hidden">Live</span>
        </span>

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

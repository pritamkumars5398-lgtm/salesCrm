"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconUsers, IconActivity, IconTrendingUp, IconCalendarCheck,
  IconMailForward, IconSparkles, IconArrowRight,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import Avatar from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/ui/Badge";
import { SkeletonStat, SkeletonCard } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { formatDistanceToNow } from "date-fns";
import { CHANNEL_CONFIG } from "@/lib/constants/channels";

const SYSTEM_STYLE = { bg: "rgba(108,99,255,0.12)", color: "var(--color-primary-light)" };

const STAT_DEFS = [
  {
    label: "Total leads",
    key: "totalLeads" as const,
    sub: (stats: any) => `+${Math.max(0, stats?.recentLeads ?? 0)} this week`,
    icon: IconUsers,
    color: "var(--color-primary-light)",
    bg: "var(--color-primary-subtle)",
  },
  {
    label: "In outreach",
    key: "inOutreach" as const,
    sub: (stats: any) => `${stats ? Math.round((stats.inOutreach / (stats.totalLeads || 1)) * 100) : 0}% of total`,
    icon: IconMailForward,
    color: "var(--color-green)",
    bg: "var(--color-green-bg)",
  },
  {
    label: "Replied",
    key: "replied" as const,
    sub: (stats: any) => `${stats && stats.inOutreach ? Math.round((stats.replied / (stats.inOutreach || 1)) * 100) : 0}% reply rate`,
    icon: IconTrendingUp,
    color: "var(--color-blue)",
    bg: "var(--color-blue-bg)",
  },
  {
    label: "Meetings booked",
    key: "meetingsThisWeek" as const,
    sub: () => "this week",
    icon: IconCalendarCheck,
    color: "var(--color-amber)",
    bg: "var(--color-amber-bg)",
  },
];

export default function Dashboard() {
  const router = useRouter();
  const {
    activeAgent, dashboardStats, dashboardRecentLeads,
    dashboardRecentActivity, setDashboard, openDrawer,
  } = useAppStore();

  // ── Data fetch (preserved exactly) ───────────────────────────
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!activeAgent) return;
    setLoading(true);
    fetch(`/api/dashboard?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then(setDashboard)
      .finally(() => setLoading(false));
  }, [activeAgent?._id]);

  const stats = dashboardStats;

  return (
    <div style={{ padding: "28px 28px 40px", minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text)", letterSpacing: "-0.02em", margin: 0 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-text3)", margin: "4px 0 0", fontWeight: 400 }}>
          Overview of all outreach activity
          {activeAgent && (
            <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text4)" }}>
              · {activeAgent.name}
            </span>
          )}
        </p>
      </div>

      {/* ── Stats Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
          : STAT_DEFS.map(({ label, key, sub, icon: Icon, color, bg }) => (
              <div
                key={label}
                className="card animate-slide-up"
                style={{
                  padding: 20,
                  position: "relative",
                  overflow: "hidden",
                  transition: "transform var(--transition-base), box-shadow var(--transition-base)",
                  animationDelay: `${STAT_DEFS.findIndex(s => s.key === key) * 60}ms`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-md)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                }}
              >
                {/* Accent bar top */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}88)`, borderRadius: "var(--radius-xl) var(--radius-xl) 0 0" }} />

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text3)", margin: 0 }}>
                    {label}
                  </p>
                  <span style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={16} style={{ color }} />
                  </span>
                </div>

                <p style={{ fontSize: 36, fontWeight: 800, color: "var(--color-text)", margin: "0 0 4px", letterSpacing: "-0.03em", lineHeight: 1 }}>
                  {stats?.[key] ?? 0}
                </p>
                <p style={{ fontSize: 12, color: "var(--color-text3)", margin: 0, fontWeight: 500 }}>
                  {sub(stats)}
                </p>
              </div>
            ))}
      </div>

      {/* ── Main Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Recent leads */}
        <div className="card animate-slide-up" style={{ overflow: "hidden", animationDelay: "80ms" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-bg4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: "var(--color-primary-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconUsers size={15} style={{ color: "var(--color-primary-light)" }} />
              </span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", margin: 0, lineHeight: 1.2 }}>Recent leads</p>
                <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>Latest added contacts</p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/leads/${activeAgent?._id || "default"}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 10px",
                borderRadius: "var(--radius-md)",
                background: "none",
                border: "none",
                color: "var(--color-primary-light)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background var(--transition-fast)",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-primary-subtle)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
            >
              View all <IconArrowRight size={12} />
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 12, width: "60%", marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: "40%" }} />
                  </div>
                  <div className="skeleton" style={{ width: 64, height: 20, borderRadius: "var(--radius-full)" }} />
                </div>
              ))}
            </div>
          ) : dashboardRecentLeads.length === 0 ? (
            <EmptyState
              icon={<IconUsers size={22} />}
              title="No leads yet"
              description="Add your first lead to get started with outreach."
              compact
            />
          ) : (
            dashboardRecentLeads.map((lead, i) => (
              <div
                key={lead._id}
                onClick={() => openDrawer(lead, "whatsapp")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 20px",
                  borderBottom: i < dashboardRecentLeads.length - 1 ? "1px solid var(--color-bg4)" : "none",
                  cursor: "pointer",
                  transition: "background var(--transition-fast)",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "var(--color-bg3)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Avatar name={lead.fullName} size="sm" />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text)", margin: "0 0 1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {lead.fullName}
                    </p>
                    <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[lead.jobTitle, lead.company].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <StatusBadge status={lead.status} size="sm" />
              </div>
            ))
          )}
        </div>

        {/* Live activity */}
        <div className="card animate-slide-up" style={{ overflow: "hidden", animationDelay: "120ms" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-bg4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", background: "var(--color-green-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconActivity size={15} style={{ color: "var(--color-green)" }} />
              </span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text)", margin: 0, lineHeight: 1.2 }}>Live activity</p>
                <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>Real-time outreach events</p>
              </div>
            </div>
            {/* Live indicator */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: "var(--radius-full)",
                background: "var(--color-green-bg)",
                color: "var(--color-green)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--color-green)", animation: "pulse-ring 1.4s ease-out infinite" }} />
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-green)", display: "block", position: "relative" }} />
              </span>
              Live
            </span>
          </div>

          <div style={{ padding: "6px 0" }}>
            {loading ? (
              <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="skeleton" style={{ height: 12, width: "70%", marginBottom: 5 }} />
                      <div className="skeleton" style={{ height: 11, width: "35%" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : dashboardRecentActivity.length === 0 ? (
              <EmptyState
                icon={<IconSparkles size={22} />}
                title="No activity yet"
                description="Activity will appear here once outreach starts."
                compact
              />
            ) : (
              dashboardRecentActivity.map((act) => {
                const cfg = CHANNEL_CONFIG[act.channel as keyof typeof CHANNEL_CONFIG];
                const style = cfg ?? SYSTEM_STYLE;
                const Icon = cfg?.Icon ?? IconActivity;
                return (
                  <div
                    key={act._id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 20px",
                      transition: "background var(--transition-fast)",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "var(--color-bg3)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
                  >
                    {/* Channel icon */}
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "var(--radius-md)",
                        background: style.bg,
                        color: style.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={14} />
                    </div>
                    {/* Text */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, color: "var(--color-text2)", margin: "0 0 2px", lineHeight: 1.5 }}>
                        {act.event} ·{" "}
                        <span style={{ fontWeight: 600, color: "var(--color-text)" }}>{act.leadName}</span>
                      </p>
                      <p style={{ fontSize: 11, color: "var(--color-text4)", margin: 0, fontFamily: "var(--font-mono)" }}>
                        {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconLayoutDashboard, IconUsers, IconListCheck, IconLayoutKanban,
  IconCalendar, IconActivity, IconSettings, IconClock,
  IconCreditCard, IconMail, IconBrandWhatsapp, IconPhone, IconMessage,
  IconShield, IconX, IconChevronRight,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Page } from "@/store/types";
import { PLANS, type PlanId } from "@/lib/plans";

const NAV_ITEMS: { id: Page; label: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard",  Icon: IconLayoutDashboard },
  { id: "leads",     label: "Leads",      Icon: IconUsers },
  { id: "sequence",  label: "Sequence",   Icon: IconListCheck },
  { id: "crm",       label: "CRM",        Icon: IconLayoutKanban },
  { id: "calendar",  label: "Calendar",   Icon: IconCalendar },
  { id: "activity",  label: "Activity",   Icon: IconActivity },
  { id: "crons",     label: "Schedules",  Icon: IconClock },
];

interface MiniUsage {
  planId: PlanId;
  leadsScraped: number;
  leadsLimit: number;
}

const OUTREACH_CHANNELS = [
  { key: "email",    label: "Email",    Icon: IconMail,          color: "var(--color-email)",    bg: "var(--color-email-bg)",    enabledKey: "emailEnabled",    valueKey: "smtpFrom"      },
  { key: "whatsapp", label: "WhatsApp", Icon: IconBrandWhatsapp, color: "var(--color-whatsapp)", bg: "var(--color-whatsapp-bg)", enabledKey: "whatsappEnabled", valueKey: "waSessionId"   },
  { key: "sms",      label: "SMS",      Icon: IconMessage,       color: "var(--color-sms)",      bg: "var(--color-sms-bg)",      enabledKey: "smsEnabled",      valueKey: "smsFrom"       },
  { key: "voice",    label: "Voice",    Icon: IconPhone,         color: "var(--color-voice)",    bg: "var(--color-voice-bg)",    enabledKey: "voiceEnabled",    valueKey: "voiceProvider" },
] as const;

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed?: boolean }) {
  if (collapsed) {
    return <div style={{ height: 1, background: "var(--color-bg4)", margin: "16px 8px 8px" }} />;
  }
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "var(--color-text4)",
        padding: "0 12px",
        marginTop: 20,
        marginBottom: 4,
      }}
    >
      {children}
    </p>
  );
}

function NavItem({
  id,
  label,
  Icon,
  active,
  badge,
  pulseBadge,
  onClick,
  collapsed,
}: {
  id: string;
  label: string;
  Icon: React.ElementType;
  active: boolean;
  badge?: React.ReactNode;
  pulseBadge?: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`nav-item ${active ? "active" : ""}`}
      style={{
        marginBottom: 1,
        padding: collapsed ? "6px 0" : undefined,
        justifyContent: collapsed ? "center" : undefined,
        display: "flex",
        alignItems: "center",
        width: "100%",
      }}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--radius-md)",
          background: active ? "var(--color-primary-subtle)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "background var(--transition-fast)",
        }}
      >
        <Icon size={15} />
      </span>
      {!collapsed && (
        <>
          <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
          {badge}
          {pulseBadge && (
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16 }}>
              <span
                className="animate-ping"
                style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--color-green)", opacity: 0.5 }}
              />
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-green)", display: "block", position: "relative" }} />
            </span>
          )}
        </>
      )}
    </button>
  );
}

function CountBadge({ count, color }: { count: number; color?: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "1px 6px",
        borderRadius: "var(--radius-full)",
        background: color ? `${color}22` : "var(--color-bg4)",
        color: color ?? "var(--color-text3)",
        fontFamily: "var(--font-mono)",
        lineHeight: 1.6,
      }}
    >
      {count}
    </span>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const {
    agents, activeAgent, setActiveAgent, currentPage, setPage,
    leads, cronJobs, setCronJobs, addAgent, updateAgent, showToast,
    userEmail, sidebarOpenMobile, setSidebarOpenMobile, sidebarCollapsed,
  } = useAppStore();

  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  const [miniUsage, setMiniUsage]     = useState<MiniUsage | null>(null);
  const [outreach, setOutreach]       = useState<Record<string, string>>({});
  const [agentStats, setAgentStats]   = useState<Record<string, { newCount: number; inOutreachCount: number; totalCount: number }>>({});
  const [liveInOutreach, setLiveInOutreach] = useState(0);

  // ── All existing data fetches preserved exactly ──────────────
  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/usage?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((d) => setMiniUsage({
        planId: d.planId,
        leadsScraped: d.usage?.leadsScraped ?? 0,
        leadsLimit: d.plan?.limits?.leadsPerMonth ?? 25,
      }))
      .catch(() => {});
    fetch(`/api/settings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((d) => setOutreach(d))
      .catch(() => {});
    fetch(`/api/crons?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((d) => setCronJobs(d))
      .catch(() => {});
    fetch(`/api/dashboard?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((d) => setLiveInOutreach(d.stats?.inOutreach ?? 0))
      .catch(() => {});
  }, [activeAgent?._id]);

  useEffect(() => {
    if (!userEmail) return;
    fetch(`/api/agents/summary?userEmail=${encodeURIComponent(userEmail)}`)
      .then((r) => r.json())
      .then((rows: { agentId: string; newCount: number; inOutreachCount: number; totalCount: number }[]) => {
        const m: Record<string, { newCount: number; inOutreachCount: number; totalCount: number }> = {};
        rows.forEach((r) => { m[r.agentId] = r; });
        setAgentStats(m);
      })
      .catch(() => {});
  }, [userEmail, agents.length]);

  // ── Computed values (preserved exactly) ──────────────────────
  const enabledCronsCount = cronJobs.filter((j) => j.enabled).length;
  const inOutreachCount =
    currentPage === "leads"
      ? leads.filter((l) => l.status === "in_outreach").length
      : (liveInOutreach || (activeAgent ? (agentStats[activeAgent._id]?.inOutreachCount ?? 0) : 0));
  const totalLeadCount  = activeAgent ? activeAgent.leadCount : 0;
  const outreachPct     = totalLeadCount > 0 ? Math.round((inOutreachCount / totalLeadCount) * 100) : 0;
  const leadCount       = activeAgent ? activeAgent.leadCount : 0;
  const planColor       = miniUsage ? PLANS[miniUsage.planId].color : "var(--color-primary-light)";
  const usagePct        = miniUsage && miniUsage.leadsLimit !== -1
    ? Math.min(100, Math.round((miniUsage.leadsScraped / miniUsage.leadsLimit) * 100))
    : 0;
  const nearLimit = usagePct >= 80;

  const collapsed = sidebarCollapsed && !isMobile;
  const sidebarWidth = collapsed ? 64 : 240;

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isMobile && sidebarOpenMobile && (
        <div
          onClick={() => setSidebarOpenMobile(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(2px)",
            zIndex: 90,
          }}
        />
      )}

      <aside
        style={{
          width: sidebarWidth,
          minWidth: isMobile ? 0 : sidebarWidth,
          height: "100vh",
          background: "var(--color-bg2)",
          backdropFilter: "blur(16px)",
          borderRight: "1px solid var(--color-bg4)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflow: "hidden",
          zIndex: 100,
          position: isMobile ? "fixed" : "relative",
          top: isMobile ? 0 : undefined,
          left: isMobile ? 0 : undefined,
          bottom: isMobile ? 0 : undefined,
          transform: isMobile ? (sidebarOpenMobile ? "translateX(0)" : "translateX(-100%)") : "none",
          transition: "width 0.2s ease, min-width 0.2s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
      <div
        style={{
          padding: collapsed ? "0" : "0 16px",
          height: 54,
          borderBottom: "1px solid var(--color-bg4)",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-md)",
              background: currentPage === "superadmin"
                ? "linear-gradient(135deg, #ef4444, #f87171)"
                : "linear-gradient(135deg, var(--color-primary), var(--color-primary-light))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(79,70,229,0.3)",
            }}
          >
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>
              {currentPage === "superadmin" ? "SA" : "S"}
            </span>
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-text)",
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.2,
                }}
              >
                {currentPage === "superadmin" ? "Admin Portal" : (activeAgent?.name || "Workspace")}
              </p>
              <p style={{ fontSize: 10, color: "var(--color-text4)", margin: 0, fontWeight: 500 }}>
                {currentPage === "superadmin" ? "Superadmin" : "AI Sales Agent"}
              </p>
            </div>
          )}
        </div>

        {/* Close (mobile) */}
        <button
          onClick={() => setSidebarOpenMobile(false)}
          aria-label="Close sidebar"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text3)",
            alignItems: "center",
            padding: 4,
            borderRadius: "var(--radius-sm)",
            transition: "background var(--transition-fast)",
          }}
          className="flex md:hidden"
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
        >
          <IconX size={15} />
        </button>
      </div>

      {/* ── Scrollable Content ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 8px 0" }}>

        {currentPage === "superadmin" ? (
          <>
            <SectionLabel collapsed={collapsed}>Admin Portal</SectionLabel>
            <div style={{ padding: "0 4px" }}>
              <NavItem
                id="superadmin"
                label="Superadmin Portal"
                Icon={IconShield}
                active={true}
                onClick={() => router.push(`/superadmin/${activeAgent?._id || "default"}`)}
                collapsed={collapsed}
              />
            </div>
            <SectionLabel collapsed={collapsed}>Client Access</SectionLabel>
            <div style={{ padding: "0 4px" }}>
              <NavItem
                id="dashboard"
                label="Switch to Agent CRM"
                Icon={IconLayoutDashboard}
                active={false}
                onClick={() => router.push(`/dashboard/${activeAgent?._id || "default"}`)}
                collapsed={collapsed}
              />
            </div>
          </>
        ) : (
          <>
            {/* ── Agent Status Card ── */}
            {activeAgent && !collapsed && (() => {
              const hasOutreach = inOutreachCount > 0;
              return (
                <div
                  style={{
                    margin: "8px 4px",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-lg)",
                    background: "var(--color-primary-subtle)",
                    border: "1px solid rgba(99,102,241,0.15)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Status dot */}
                    <span style={{ position: "relative", display: "inline-flex" }}>
                      {activeAgent.status === "active" && (
                        <span
                          style={{
                            position: "absolute",
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            background: "var(--color-green)",
                            animation: "pulse-ring 1.8s ease-out infinite",
                            opacity: 0.5,
                          }}
                        />
                      )}
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: activeAgent.status === "active" ? "var(--color-green)" : "var(--color-text4)",
                          display: "block",
                          position: "relative",
                        }}
                      />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-primary-light)", flex: 1 }}>
                      Workspace
                    </span>
                    {inOutreachCount > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 7px",
                          borderRadius: "var(--radius-full)",
                          background: "var(--color-green-bg)",
                          color: "var(--color-green)",
                        }}
                      >
                        {inOutreachCount} live
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: "var(--radius-full)",
                        background: "rgba(99,102,241,0.12)",
                        color: "var(--color-primary-light)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {activeAgent.leadCount}
                    </span>
                  </div>

                  {/* Outreach progress bar */}
                  {hasOutreach && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: "var(--color-green)" }}>
                          {outreachPct >= 100 ? "✓ Outreach done" : `${inOutreachCount} in outreach`}
                        </span>
                        <span style={{ fontSize: 9.5, color: "var(--color-text3)" }}>{outreachPct}%</span>
                      </div>
                      <div style={{ height: 3, borderRadius: 99, background: "rgba(99,102,241,0.15)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${outreachPct}%`,
                            borderRadius: 99,
                            background: "linear-gradient(90deg, var(--color-green), #059669)",
                            transition: "width 0.5s ease",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          {outreachPct < 100 && (
                            <span
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                                animation: "shimmer 1.4s infinite",
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Navigation ── */}
            <SectionLabel collapsed={collapsed}>Navigation</SectionLabel>
            <nav style={{ padding: "0 4px", display: "flex", flexDirection: "column" }}>
              {NAV_ITEMS.map(({ id, label, Icon }) => (
                <NavItem
                  key={id}
                  id={id}
                  label={label}
                  Icon={Icon}
                  active={currentPage === id}
                  onClick={() => router.push(`/${id}/${activeAgent?._id || "default"}`)}
                  badge={
                    id === "leads" && leadCount > 0 ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {inOutreachCount > 0 && (
                          <CountBadge count={inOutreachCount} color="var(--color-green)" />
                        )}
                        <CountBadge count={leadCount} />
                      </div>
                    ) : undefined
                  }
                  pulseBadge={id === "crons" && enabledCronsCount > 0}
                  collapsed={collapsed}
                />
              ))}
            </nav>

            {/* ── Outreach Channels ── */}
            <SectionLabel collapsed={collapsed}>Channels</SectionLabel>
            <div style={{ padding: "0 4px", display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
              {OUTREACH_CHANNELS.map(({ key, label, Icon, color, bg, enabledKey, valueKey }) => {
                const enabled = outreach[enabledKey] !== "false";
                const value   = outreach[valueKey] || "";
                return (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: collapsed ? "center" : undefined,
                      gap: collapsed ? 0 : 8,
                      padding: collapsed ? "7px 0" : "7px 10px",
                      borderRadius: "var(--radius-lg)",
                      background: enabled ? bg : "transparent",
                      opacity: enabled ? 1 : 0.45,
                      transition: "opacity var(--transition-fast)",
                    }}
                    title={collapsed ? `${label}: ${enabled && value ? value : enabled ? "Not configured" : "Disabled"}` : undefined}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "var(--radius-md)",
                        background: enabled ? `${bg}` : "var(--color-bg3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={13} style={{ color: enabled ? color : "var(--color-text4)" }} />
                    </span>
                    {!collapsed && (
                      <>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)", margin: 0, lineHeight: 1.2 }}>
                            {label}
                          </p>
                          <p
                            style={{ fontSize: 10, color: enabled && value ? color : "var(--color-text4)", margin: "1px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                            title={value}
                          >
                            {enabled && value ? value : enabled ? "Not configured" : "Disabled"}
                          </p>
                        </div>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: enabled ? "var(--color-green)" : "var(--color-bg5)",
                            flexShrink: 0,
                          }}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Config ── */}
            <SectionLabel collapsed={collapsed}>Config</SectionLabel>
            <div style={{ padding: "0 4px", display: "flex", flexDirection: "column" }}>
              <NavItem
                id="settings"
                label="Settings"
                Icon={IconSettings}
                active={currentPage === "settings"}
                onClick={() => router.push(`/settings/${activeAgent?._id || "default"}`)}
                collapsed={collapsed}
              />
              <NavItem
                id="plans"
                label="Plans"
                Icon={IconCreditCard}
                active={currentPage === "plans"}
                onClick={() => router.push(`/plans/${activeAgent?._id || "default"}`)}
                badge={
                  miniUsage ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                        borderRadius: "var(--radius-full)",
                        background: nearLimit ? "var(--color-red-bg)" : "var(--color-bg4)",
                        color: nearLimit ? "var(--color-red)" : "var(--color-text3)",
                      }}
                    >
                      {PLANS[miniUsage.planId].name}
                    </span>
                  ) : undefined
                }
                collapsed={collapsed}
              />
            </div>

            {/* ── Admin (conditional) ── */}
            {userEmail?.toLowerCase() === "admin@salesagent.ai" && (
              <>
                <SectionLabel collapsed={collapsed}>Admin</SectionLabel>
                <div style={{ padding: "0 4px" }}>
                  <NavItem
                    id="superadmin"
                    label="Superadmin"
                    Icon={IconShield}
                    active={(currentPage as string) === "superadmin"}
                    onClick={() => router.push(`/superadmin/${activeAgent?._id || "default"}`)}
                    collapsed={collapsed}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Usage Mini-bar (Footer) ── */}
      {miniUsage && !collapsed && (
        <div
          style={{
            padding: "12px",
            borderTop: "1px solid var(--color-bg4)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-bg3)",
              border: "1px solid var(--color-bg4)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-text3)" }}>
                Monthly quota
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: nearLimit ? "var(--color-red)" : "var(--color-text2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {miniUsage.leadsScraped}/{miniUsage.leadsLimit === -1 ? "∞" : miniUsage.leadsLimit}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: "var(--color-bg4)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: miniUsage.leadsLimit === -1 ? "5%" : `${usagePct}%`,
                  borderRadius: 99,
                  background: nearLimit ? "var(--color-red)" : planColor,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            {nearLimit && (
              <button
                onClick={() => router.push(`/plans/${activeAgent?._id || "default"}`)}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "5px 0",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-red-bg)",
                  color: "var(--color-red)",
                  fontSize: 11,
                  fontWeight: 700,
                  border: "1px solid rgba(239,68,68,0.2)",
                  cursor: "pointer",
                  transition: "background var(--transition-fast)",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.15)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--color-red-bg)")}
              >
                Upgrade plan →
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconLayoutDashboard, IconUsers, IconListCheck, IconLayoutKanban,
  IconCalendar, IconActivity, IconSettings, IconPlus, IconClock,
  IconCreditCard, IconMail, IconBrandWhatsapp, IconPhone, IconMessage,
  IconShield,
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
  { key: "email",    label: "Email",     Icon: IconMail,           color: "#4dabf7", enabledKey: "emailEnabled",    valueKey: "smtpFrom"     },
  { key: "whatsapp", label: "WhatsApp",  Icon: IconBrandWhatsapp,  color: "#22c97a", enabledKey: "whatsappEnabled", valueKey: "waPhone"      },
  { key: "sms",      label: "SMS",       Icon: IconMessage,        color: "#cc99ff", enabledKey: "smsEnabled",      valueKey: "smsFrom"      },
  { key: "voice",    label: "Voice",     Icon: IconPhone,          color: "#f5a623", enabledKey: "voiceEnabled",    valueKey: "voiceProvider"},
] as const;

export default function Sidebar() {
  const router = useRouter();
  const { agents, activeAgent, setActiveAgent, currentPage, setPage, leads, addAgent, showToast, userEmail } =
    useAppStore();
  const [miniUsage, setMiniUsage] = useState<MiniUsage | null>(null);
  const [outreach, setOutreach] = useState<Record<string, string>>({});

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
  }, [activeAgent?._id]);

  async function handleNewAgent() {
    const name = prompt("Agent name:");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), userEmail }),
      });
      const agent = await res.json();
      addAgent(agent);
      showToast(`${agent.name} created`);
      router.push(`/${currentPage}/${agent._id}`);
    } catch {
      showToast("Failed to create agent", "error");
    }
  }

  const leadCount = leads.length;
  const planColor = miniUsage ? PLANS[miniUsage.planId].color : "#6366f1";
  const usagePct  = miniUsage && miniUsage.leadsLimit !== -1
    ? Math.min(100, Math.round((miniUsage.leadsScraped / miniUsage.leadsLimit) * 100))
    : 0;
  const nearLimit = usagePct >= 80;

  return (
    <aside
      className="flex flex-col overflow-y-auto flex-shrink-0 border-r"
      style={{
        width: 220,
        minWidth: 220,
        background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)",
        borderColor: "#e2e8f0",
      }}
    >
      {/* Logo */}
      <div
        className="px-[18px] py-5 text-[15px] font-semibold tracking-tight flex items-center gap-2 border-b"
        style={{ borderColor: "#e2e8f0" }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: currentPage === "superadmin" ? "#ef4444" : "#6c63ff" }} />
        {currentPage === "superadmin" ? (
          <span>Sales<span style={{ color: "#ef4444" }}>Admin</span></span>
        ) : (
          <span>Sales<span style={{ color: "var(--color-accent2)" }}>Agent</span></span>
        )}
      </div>

      {currentPage === "superadmin" ? (
        <>
          {/* Admin Navigation */}
          <div className="px-[18px] pt-4 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
            Admin Portal
          </div>
          <div className="px-2.5 flex flex-col gap-0.5">
            <button
              onClick={() => router.push(`/superadmin/${activeAgent?._id || "default"}`)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left text-[var(--color-accent2)]"
              style={{ background: "rgba(108,99,255,0.12)" }}
            >
              <IconShield size={16} />
              Superadmin Portal
            </button>
          </div>

          {/* Quick Actions */}
          <div className="px-[18px] pt-4 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
            Client Access
          </div>
          <div className="px-2.5 flex flex-col gap-0.5">
            <button
              onClick={() => router.push(`/dashboard/${activeAgent?._id || "default"}`)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left text-[var(--color-text2)] hover:text-[var(--color-text)]"
            >
              <IconLayoutDashboard size={16} />
              Switch to Agent CRM
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Agents */}
          <div className="px-[18px] pt-4 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
            Agents
          </div>
          <div className="px-2.5 pb-2 flex flex-col gap-0.5">
            {agents.map((agent) => (
              <button
                key={agent._id}
                onClick={() => router.push(`/${currentPage}/${agent._id}`)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
                  activeAgent?._id === agent._id
                    ? "text-[var(--color-accent2)]"
                    : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
                }`}
                style={activeAgent?._id === agent._id ? { background: "rgba(108,99,255,0.12)" } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: agent.status === "active" ? "#22c97a" : "var(--color-text3)" }}
                />
                {agent.name}
                <span
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                  style={{ background: "var(--color-bg4)", color: "var(--color-text3)" }}
                >
                  {agent.leadCount}
                </span>
              </button>
            ))}
            <button
              onClick={handleNewAgent}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-[10px] text-[12px] border border-dashed transition-colors duration-150 mt-1 w-full"
              style={{ borderColor: "rgba(0,0,0,0.15)", color: "var(--color-text3)" }}
            >
              <IconPlus size={14} />
              New agent
            </button>
          </div>

          {/* Menu */}
          <div className="px-[18px] pt-4 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
            Menu
          </div>
          <nav className="px-2.5 flex flex-col gap-0.5">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => router.push(`/${id}/${activeAgent?._id || "default"}`)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
                  currentPage === id
                    ? "text-[var(--color-accent2)]"
                    : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
                }`}
                style={currentPage === id ? { background: "rgba(108,99,255,0.12)" } : undefined}
              >
                <Icon size={16} className="flex-shrink-0" />
                {label}
                {id === "leads" && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-mono" style={{ background: "var(--color-bg4)", color: "var(--color-text3)" }}>
                    {leadCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Outreach Channels */}
          <div className="px-[18px] pt-4 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
            Outreach
          </div>
          <div className="px-2.5 pb-2 flex flex-col gap-1">
            {OUTREACH_CHANNELS.map(({ key, label, Icon, color, enabledKey, valueKey }) => {
              const enabled = outreach[enabledKey] !== "false";
              const value = outreach[valueKey] || "";
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-[10px]"
                  style={{ background: enabled ? `${color}0d` : "transparent", opacity: enabled ? 1 : 0.45 }}
                >
                  <span
                    className="shrink-0 flex items-center justify-center rounded-[7px]"
                    style={{ width: 26, height: 26, background: enabled ? `${color}22` : "var(--color-bg3)" }}
                  >
                    <Icon size={13} style={{ color: enabled ? color : "var(--color-text3)" }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-semibold leading-none" style={{ color: "var(--color-text2)" }}>
                      {label}
                    </div>
                    <div className="text-[10px] mt-0.5 truncate" style={{ color: enabled && value ? color : "var(--color-text3)" }} title={value}>
                      {enabled && value ? value : enabled ? "Not configured" : "Disabled"}
                    </div>
                  </div>
                  <span
                    className="shrink-0 w-1.5 h-1.5 rounded-full"
                    style={{ background: enabled ? "#22c97a" : "#cbd5e1" }}
                  />
                </div>
              );
            })}
          </div>

          {/* Config */}
          <div className="px-[18px] pt-2 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
            Config
          </div>
          <div className="px-2.5 flex flex-col gap-0.5">
            <button
              onClick={() => router.push(`/settings/${activeAgent?._id || "default"}`)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
                currentPage === "settings" ? "text-[var(--color-accent2)]" : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
              }`}
              style={currentPage === "settings" ? { background: "rgba(108,99,255,0.12)" } : undefined}
            >
              <IconSettings size={16} />
              Settings
            </button>
            <button
              onClick={() => router.push(`/plans/${activeAgent?._id || "default"}`)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
                currentPage === "plans" ? "text-[var(--color-accent2)]" : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
              }`}
              style={currentPage === "plans" ? { background: "rgba(108,99,255,0.12)" } : undefined}
            >
              <IconCreditCard size={16} />
              Plans
              {miniUsage && (
                <span
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{
                    background: nearLimit ? "rgba(239,68,68,0.1)" : "var(--color-bg4)",
                    color: nearLimit ? "#ef4444" : "var(--color-text3)",
                  }}
                >
                  {PLANS[miniUsage.planId].name}
                </span>
              )}
            </button>
          </div>

          {/* Admin */}
          {userEmail?.toLowerCase() === "admin@salesagent.ai" && (
            <>
              <div className="px-[18px] pt-2 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
                Admin
              </div>
              <div className="px-2.5 flex flex-col gap-0.5">
                <button
                  onClick={() => router.push(`/superadmin/${activeAgent?._id || "default"}`)}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
                    currentPage === "superadmin" ? "text-[var(--color-accent2)]" : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
                  }`}
                  style={currentPage === "superadmin" ? { background: "rgba(108,99,255,0.12)" } : undefined}
                >
                  <IconShield size={16} />
                  Superadmin
                </button>
              </div>
            </>
          )}

          {/* Usage mini-bar */}
          {miniUsage && (
            <div
              className="mx-2.5 mt-auto mb-3 rounded-[10px] p-3"
              style={{ background: "var(--color-bg3)", border: "1px solid var(--color-bg4)" }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold" style={{ color: "var(--color-text3)" }}>
                  Leads this month
                </span>
                <span className="text-[11px] font-bold" style={{ color: nearLimit ? "#ef4444" : "var(--color-text2)" }}>
                  {miniUsage.leadsScraped}/{miniUsage.leadsLimit === -1 ? "∞" : miniUsage.leadsLimit}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: "var(--color-bg4)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: miniUsage.leadsLimit === -1 ? "5%" : `${usagePct}%`,
                  borderRadius: 99,
                  background: nearLimit ? "#ef4444" : planColor,
                  transition: "width 0.4s ease",
                }} />
              </div>
              {nearLimit && (
                <button
                  onClick={() => router.push(`/plans/${activeAgent?._id || "default"}`)}
                  className="w-full mt-2 text-[11px] font-semibold py-1 rounded-md"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "none", cursor: "pointer" }}
                >
                  Upgrade plan →
                </button>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

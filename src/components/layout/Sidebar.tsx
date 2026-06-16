"use client";
import {
  IconLayoutDashboard, IconUsers, IconListCheck, IconLayoutKanban,
  IconCalendar, IconActivity, IconSettings, IconPlus, IconClock,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Page } from "@/store/types";

const NAV_ITEMS: { id: Page; label: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard",   Icon: IconLayoutDashboard },
  { id: "leads",     label: "Leads",       Icon: IconUsers },
  { id: "sequence",  label: "Sequence",    Icon: IconListCheck },
  { id: "crm",       label: "CRM",         Icon: IconLayoutKanban },
  { id: "calendar",  label: "Calendar",    Icon: IconCalendar },
  { id: "activity",  label: "Activity",    Icon: IconActivity },
  { id: "crons",     label: "Schedules",   Icon: IconClock },
];

export default function Sidebar() {
  const { agents, activeAgent, setActiveAgent, currentPage, setPage, leads, addAgent, showToast } =
    useAppStore();

  async function handleNewAgent() {
    const name = prompt("Agent name:");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const agent = await res.json();
      addAgent(agent);
      showToast(`${agent.name} created`);
    } catch {
      showToast("Failed to create agent", "error");
    }
  }

  const leadCount = leads.length;

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
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: "#6c63ff" }}
        />
        Sales<span style={{ color: "var(--color-accent2)" }}>Agent</span>
      </div>

      {/* Agents */}
      <div className="px-[18px] pt-4 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
        Agents
      </div>
      <div className="px-2.5 pb-2 flex flex-col gap-0.5">
        {agents.map((agent) => (
          <button
            key={agent._id}
            onClick={() => setActiveAgent(agent)}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
              activeAgent?._id === agent._id
                ? "text-[var(--color-accent2)]"
                : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
            }`}
            style={
              activeAgent?._id === agent._id
                ? { background: "rgba(108,99,255,0.12)" }
                : undefined
            }
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                background: agent.status === "active" ? "#22c97a" : "var(--color-text3)",
              }}
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
            onClick={() => setPage(id)}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
              currentPage === id
                ? "text-[var(--color-accent2)]"
                : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
            }`}
            style={
              currentPage === id
                ? { background: "rgba(108,99,255,0.12)" }
                : undefined
            }
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

      {/* Config */}
      <div className="px-[18px] pt-4 pb-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--color-text3)" }}>
        Config
      </div>
      <div className="px-2.5 pb-4">
        <button
          onClick={() => setPage("settings")}
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13px] transition-colors duration-150 cursor-pointer w-full text-left ${
            currentPage === "settings"
              ? "text-[var(--color-accent2)]"
              : "text-[var(--color-text2)] hover:text-[var(--color-text)]"
          }`}
          style={currentPage === "settings" ? { background: "rgba(108,99,255,0.12)" } : undefined}
        >
          <IconSettings size={16} />
          Settings
        </button>
      </div>
    </aside>
  );
}

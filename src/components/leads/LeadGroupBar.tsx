"use client";
import { IconAlertTriangle, IconSettings, IconSearch } from "@tabler/icons-react";
import type { LeadGroup } from "@/lib/api/workspace.api";

interface Props {
  groups: LeadGroup[];
  activeGroupId: string;
  onSelect: (groupId: string) => void;
  onManage: () => void;
}

/** Group chips above the leads table — one click shows a segment. */
export default function LeadGroupBar({ groups, activeGroupId, onSelect, onManage }: Props) {
  if (groups.length === 0) {
    return (
      <button onClick={onManage} className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-text3 hover:text-text2">
        <IconSettings size={13} /> Group your leads (e.g. Hot leads, Hotels in Goa) — set up groups
      </button>
    );
  }
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
      active ? "border-[var(--color-primary-light)] bg-[var(--color-primary-subtle)] text-[var(--color-primary-light)]" : "border-bg4 bg-bg2 text-text2 hover:bg-bg3"
    }`;

  const active = groups.find((g) => g._id === activeGroupId);

  return (
    <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
      <button className={chip(activeGroupId === "all")} onClick={() => onSelect("all")}>All leads</button>
      {groups.map((g) => (
        <button
          key={g._id}
          className={chip(activeGroupId === g._id)}
          onClick={() => onSelect(g._id)}
          title={g.problems[0] ?? (g.kind === "smart" ? "Smart group — updates itself from its rules" : "Manual group")}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
          {g.name}
          <span className="font-mono text-[11px] opacity-70">{g.memberCount}</span>
          {g.problems.length > 0 && <IconAlertTriangle size={12} className="text-red-500" />}
        </button>
      ))}
      <button onClick={onManage} className="ml-1 text-text3 hover:text-text2" aria-label="Manage groups" title="Manage groups">
        <IconSettings size={15} />
      </button>
      {(!active || active.kind === "manual") && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("crm:find-leads-for-group", { detail: { groupId: active?._id } }))}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-bg4 bg-bg2 px-3 py-1 text-[12px] font-semibold text-text2 hover:bg-bg3"
          title="Run the lead finder and put new leads in this group"
        >
          <IconSearch size={13} /> {active ? "Find leads for this group" : "Find leads for a group"}
        </button>
      )}
    </div>
  );
}

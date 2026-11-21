"use client";
import { useEffect, useState } from "react";
import { IconUsersGroup } from "@tabler/icons-react";

type GroupOption = { _id: string; name: string; memberCount?: number };

/**
 * "All groups / <group>" picker for lists that can be narrowed to one lead group. Hidden when there are no groups.
 * `variant="pill"` is the small chip-style select that sits in a row with other filters.
 */
export default function GroupFilterSelect({ agentId, value, onChange, className = "", variant = "input", accent = "#f59e0b" }: {
  agentId: string;
  value: string;
  onChange: (groupId: string) => void;
  className?: string;
  variant?: "input" | "pill";
  accent?: string;
}) {
  const [groups, setGroups] = useState<GroupOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lead-groups?agentId=${agentId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => { if (!cancelled) setGroups(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setGroups([]); });
    return () => { cancelled = true; };
  }, [agentId]);

  // The picked group was deleted — fall back to all.
  useEffect(() => {
    if (value && groups.length && !groups.some((g) => g._id === value)) onChange("");
  }, [groups, value, onChange]);

  if (groups.length === 0) return null;

  const options = (
    <>
      <option value="">{variant === "pill" ? "Group" : "All groups"}</option>
      {groups.map((g) => (
        <option key={g._id} value={g._id}>{g.name}{typeof g.memberCount === "number" ? ` (${g.memberCount})` : ""}</option>
      ))}
    </>
  );

  if (variant === "pill") {
    return (
      <select
        aria-label="Filter by lead group"
        title="Lead group"
        className={`min-w-0 text-[11.5px] font-semibold px-2 py-1 rounded-md border cursor-pointer truncate ${className}`}
        style={{ background: value ? `${accent}1f` : "var(--color-bg3)", borderColor: "var(--color-bg4)", color: value ? accent : "var(--color-text2)" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options}
      </select>
    );
  }

  return (
    <label className={`relative flex items-center ${className}`}>
      <IconUsersGroup size={14} className="pointer-events-none absolute left-2.5 text-text3" />
      <select
        aria-label="Filter by lead group"
        className="form-input w-full text-[12px]"
        style={{ paddingTop: 6, paddingBottom: 6, paddingLeft: 30 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options}
      </select>
    </label>
  );
}

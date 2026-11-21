"use client";
import { useEffect, useState } from "react";
import { IconUsersGroup } from "@tabler/icons-react";

type GroupOption = { _id: string; name: string; memberCount?: number };

/** "All groups / <group>" picker for lists that can be narrowed to one lead group. Hidden when there are no groups. */
export default function GroupFilterSelect({ agentId, value, onChange, className = "" }: {
  agentId: string;
  value: string;
  onChange: (groupId: string) => void;
  className?: string;
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
  return (
    <label className={`relative flex items-center ${className}`}>
      <IconUsersGroup size={13} className="pointer-events-none absolute left-2.5 text-text3" />
      <select
        aria-label="Filter by lead group"
        className="form-input w-full py-1.5 pl-7 text-[12px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All groups</option>
        {groups.map((g) => (
          <option key={g._id} value={g._id}>{g.name}{typeof g.memberCount === "number" ? ` (${g.memberCount})` : ""}</option>
        ))}
      </select>
    </label>
  );
}

"use client";
import { IconCheck } from "@tabler/icons-react";

export default function SavedBadge() {
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#10b981" }}>
      <IconCheck size={12} /> Saved
    </span>
  );
}

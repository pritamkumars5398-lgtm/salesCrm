"use client";
import type { SettingsCard } from "@/lib/constants/settings";

interface Props {
  card: SettingsCard;
  active: string;
  toggles: Record<string, boolean>;
  onSelect: (key: string) => void;
}

export default function SettingsNavItem({ card, active, toggles, onSelect }: Props) {
  const isActive = active === card.key;
  return (
    <button
      onClick={() => onSelect(card.key)}
      className="flex items-center gap-2.5 w-full text-left transition-all duration-150"
      style={{ padding: "8px 10px", borderRadius: 10, background: isActive ? "rgba(79,70,229,0.08)" : "transparent", border: "none", cursor: "pointer" }}
    >
      <span
        className="shrink-0 flex items-center justify-center"
        style={{ width: 30, height: 30, borderRadius: 8, background: isActive ? card.iconBg : "var(--color-bg3)" }}
      >
        <card.Icon size={15} style={{ color: isActive ? card.iconColor : "var(--color-text3)" }} />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold leading-none truncate" style={{ color: isActive ? "#4f46e5" : "var(--color-text)" }}>
          {card.title}
        </p>
        <p className="text-[10.5px] leading-tight mt-0.5 truncate" style={{ color: "var(--color-text3)" }}>
          {card.description}
        </p>
      </div>
      {card.togglable && (
        <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: toggles[card.key] !== false ? "#10b981" : "#cbd5e1" }} />
      )}
    </button>
  );
}

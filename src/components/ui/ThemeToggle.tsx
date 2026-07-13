"use client";

import { useEffect, useRef, useState } from "react";
import { IconSun, IconMoon, IconDeviceDesktop, IconCheck } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: React.ElementType }[] = [
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
  { value: "system", label: "System", Icon: IconDeviceDesktop },
];

export default function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const Active = (OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]).Icon;

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        title="Change theme"
        className="flex items-center justify-center rounded-lg p-1.5 text-text3 transition-colors hover:bg-bg3 hover:text-text"
      >
        <Active size={18} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-40 rounded-xl border border-bg4 bg-bg2 p-1.5"
          style={{ boxShadow: "var(--shadow-xl)", animation: "slideDown 200ms ease both" }}
        >
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium text-text transition-colors hover:bg-bg3"
            >
              <Icon size={15} className="text-text3" />
              <span className="flex-1">{label}</span>
              {theme === value && <IconCheck size={14} className="text-primary-light" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

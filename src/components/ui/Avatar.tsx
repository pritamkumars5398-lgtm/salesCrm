"use client";
import React from "react";

function avatarColor(name: string): string {
  const COLORS = [
    "#4f46e5", "#0891b2", "#059669", "#d97706",
    "#7c3aed", "#db2777", "#dc2626", "#0369a1",
  ];
  const i = name
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length;
  return COLORS[i];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  src?: string;
  ring?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

const SIZE_MAP: Record<AvatarSize, { px: number; fontSize: number; fontWeight: number }> = {
  xs: { px: 22,  fontSize: 9,  fontWeight: 700 },
  sm: { px: 28,  fontSize: 11, fontWeight: 700 },
  md: { px: 34,  fontSize: 13, fontWeight: 700 },
  lg: { px: 44,  fontSize: 16, fontWeight: 800 },
  xl: { px: 56,  fontSize: 20, fontWeight: 800 },
};

export default function Avatar({
  name,
  size = "md",
  src,
  ring = false,
  style,
  className = "",
}: AvatarProps) {
  const { px, fontSize, fontWeight } = SIZE_MAP[size];
  const bg = avatarColor(name);
  const ini = getInitials(name);

  return (
    <div
      className={className}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        background: src ? "transparent" : bg,
        color: "#fff",
        fontSize,
        fontWeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: ring ? `2px solid ${bg}55` : undefined,
        boxShadow: ring ? `0 0 0 2px ${bg}33` : undefined,
        ...style,
      }}
      aria-label={name}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        ini
      )}
    </div>
  );
}

export { avatarColor, getInitials };

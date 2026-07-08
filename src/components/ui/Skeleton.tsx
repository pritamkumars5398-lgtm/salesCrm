"use client";
import React from "react";

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = "var(--radius-md)",
  className = "",
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius, ...style }}
      aria-hidden
    />
  );
}

export function SkeletonText({
  lines = 3,
  lastWidth = "60%",
}: {
  lines?: number;
  lastWidth?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={13}
          width={i === lines - 1 ? lastWidth : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      className="card"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Skeleton width={40} height={40} borderRadius="50%" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton height={13} width="60%" />
          <Skeleton height={11} width="40%" />
        </div>
      </div>
      <Skeleton height={60} />
      <div style={{ display: "flex", gap: 8 }}>
        <Skeleton height={28} width={80} borderRadius="var(--radius-md)" />
        <Skeleton height={28} width={60} borderRadius="var(--radius-md)" />
      </div>
    </div>
  );
}

export function SkeletonTableRow({ cols = 7 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <Skeleton height={13} width={i === 0 ? 140 : 80} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonStat() {
  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <Skeleton height={11} width={80} />
      <Skeleton height={36} width={64} borderRadius="var(--radius-sm)" />
      <Skeleton height={11} width={100} />
    </div>
  );
}

export default Skeleton;

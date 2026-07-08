"use client";
import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: compact ? "32px 20px" : "64px 24px",
        gap: 12,
      }}
    >
      {icon && (
        <div
          style={{
            width: compact ? 44 : 56,
            height: compact ? 44 : 56,
            borderRadius: "var(--radius-xl)",
            background: "var(--color-bg3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 4,
            color: "var(--color-text4)",
          }}
        >
          {icon}
        </div>
      )}
      <p
        style={{
          fontSize: compact ? 13 : 15,
          fontWeight: 700,
          color: "var(--color-text2)",
          margin: 0,
        }}
      >
        {title}
      </p>
      {description && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--color-text3)",
            margin: 0,
            lineHeight: 1.6,
            maxWidth: 320,
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

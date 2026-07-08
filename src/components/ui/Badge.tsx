"use client";
import React from "react";

type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "outline";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  dotAnimate?: boolean;
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
}

const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  default: {
    background: "var(--color-bg3)",
    color: "var(--color-text2)",
    border: "1px solid var(--color-bg4)",
  },
  primary: {
    background: "var(--color-primary-subtle)",
    color: "var(--color-primary-light)",
    border: "1px solid rgba(99,102,241,0.2)",
  },
  success: {
    background: "var(--color-green-bg)",
    color: "var(--color-green)",
    border: "1px solid rgba(16,185,129,0.2)",
  },
  warning: {
    background: "var(--color-amber-bg)",
    color: "var(--color-amber)",
    border: "1px solid rgba(245,158,11,0.2)",
  },
  danger: {
    background: "var(--color-red-bg)",
    color: "var(--color-red)",
    border: "1px solid rgba(239,68,68,0.2)",
  },
  info: {
    background: "var(--color-blue-bg)",
    color: "var(--color-blue)",
    border: "1px solid rgba(59,130,246,0.2)",
  },
  purple: {
    background: "var(--color-purple-bg)",
    color: "var(--color-purple)",
    border: "1px solid rgba(139,92,246,0.2)",
  },
  outline: {
    background: "transparent",
    color: "var(--color-text3)",
    border: "1px solid var(--color-bg5)",
  },
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  default: "var(--color-text3)",
  primary: "var(--color-primary-light)",
  success: "var(--color-green)",
  warning: "var(--color-amber)",
  danger: "var(--color-red)",
  info: "var(--color-blue)",
  purple: "var(--color-purple)",
  outline: "var(--color-text3)",
};

const SIZE_STYLES = {
  sm: { fontSize: 10, padding: "2px 7px" },
  md: { fontSize: 11, padding: "3px 9px" },
};

export default function Badge({
  variant = "default",
  children,
  dot = false,
  dotAnimate = false,
  size = "md",
  className = "",
  style,
}: BadgeProps) {
  return (
    <span
      className={`pill ${className}`}
      style={{
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        ...style,
      }}
    >
      {dot && (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {dotAnimate && (
            <span
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background: DOT_COLORS[variant],
                animation: "pulse-ring 1.4s ease-out infinite",
              }}
            />
          )}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: DOT_COLORS[variant],
              flexShrink: 0,
              display: "inline-block",
              position: "relative",
            }}
          />
        </span>
      )}
      {children}
    </span>
  );
}

/* ── Specialized status badges ──────────────────────────────── */
const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  new:            { variant: "default",  label: "New" },
  in_outreach:    { variant: "primary",  label: "In Outreach" },
  replied:        { variant: "info",     label: "Replied" },
  meeting_booked: { variant: "success",  label: "Meeting Booked" },
  closed:         { variant: "success",  label: "Closed" },
  do_not_contact: { variant: "danger",   label: "Do Not Contact" },
  active:         { variant: "success",  label: "Active" },
  inactive:       { variant: "default",  label: "Inactive" },
};

export function StatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const config = STATUS_MAP[status] ?? { variant: "default" as BadgeVariant, label: status };
  return (
    <Badge variant={config.variant} dot size={size}>
      {config.label}
    </Badge>
  );
}

const CHANNEL_MAP: Record<string, { color: string; bg: string; label: string }> = {
  email:    { color: "var(--color-email)",    bg: "var(--color-email-bg)",    label: "Email" },
  whatsapp: { color: "var(--color-whatsapp)", bg: "var(--color-whatsapp-bg)", label: "WhatsApp" },
  sms:      { color: "var(--color-sms)",      bg: "var(--color-sms-bg)",      label: "SMS" },
  call:     { color: "var(--color-voice)",    bg: "var(--color-voice-bg)",    label: "Voice" },
};

export function ChannelBadge({ channel }: { channel: string }) {
  const meta = CHANNEL_MAP[channel] ?? { color: "var(--color-text3)", bg: "var(--color-bg3)", label: channel };
  return (
    <span
      className="pill"
      style={{
        fontSize: 10,
        padding: "2px 7px",
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.color}33`,
      }}
    >
      <span
        style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, flexShrink: 0, display: "inline-block" }}
      />
      {meta.label}
    </span>
  );
}

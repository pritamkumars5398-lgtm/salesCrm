"use client";
import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
type Size = "sm" | "md" | "lg" | "icon-sm" | "icon-md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

function Spinner({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path
        d="M12 2 a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
  ghost: "btn btn-ghost",
  danger: "btn btn-danger",
  success: "btn btn-success",
  warning: "btn",
};

const VARIANT_STYLE: Record<Variant, React.CSSProperties> = {
  primary: {},
  secondary: {},
  ghost: {},
  danger: {},
  success: {},
  warning: {
    background: "linear-gradient(135deg, #d97706, #f59e0b)",
    color: "#fff",
    boxShadow: "0 4px 14px rgba(217,119,6,0.28)",
  },
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "btn-sm",
  md: "btn-md",
  lg: "btn-lg",
  "icon-sm": "",
  "icon-md": "",
};

const SIZE_STYLE: Record<Size, React.CSSProperties> = {
  sm: {},
  md: {},
  lg: {},
  "icon-sm": {
    padding: "6px",
    borderRadius: "var(--radius-md)",
    width: 28,
    height: 28,
  },
  "icon-md": {
    padding: "8px",
    borderRadius: "var(--radius-md)",
    width: 34,
    height: 34,
  },
};

const SPINNER_SIZE: Record<Size, number> = {
  sm: 13,
  md: 14,
  lg: 15,
  "icon-sm": 13,
  "icon-md": 15,
};

export default function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  style,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      style={{ ...VARIANT_STYLE[variant], ...SIZE_STYLE[size], ...style }}
    >
      {loading ? (
        <Spinner size={SPINNER_SIZE[size]} />
      ) : leftIcon ? (
        leftIcon
      ) : null}
      {children}
      {!loading && rightIcon ? rightIcon : null}
    </button>
  );
}

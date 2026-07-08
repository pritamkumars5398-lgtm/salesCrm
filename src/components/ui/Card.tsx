"use client";
import React from "react";

type Variant = "default" | "glass" | "elevated" | "inset";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  children: React.ReactNode;
  noPadding?: boolean;
  hover?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  default:  "card",
  glass:    "card-glass",
  elevated: "card-elevated",
  inset:    "",
};

const VARIANT_EXTRA_STYLE: Record<Variant, React.CSSProperties> = {
  default:  {},
  glass:    {},
  elevated: {},
  inset: {
    background: "var(--color-bg3)",
    border: "1px solid var(--color-bg4)",
    borderRadius: "var(--radius-lg)",
  },
};

export default function Card({
  variant = "default",
  children,
  noPadding = false,
  hover = false,
  style,
  className = "",
  ...rest
}: CardProps) {
  const hoverStyle: React.CSSProperties = hover
    ? {
        cursor: "pointer",
        transition: "box-shadow var(--transition-base), transform var(--transition-base)",
      }
    : {};

  return (
    <div
      {...rest}
      className={`${VARIANT_CLASS[variant]} ${className}`}
      style={{
        ...VARIANT_EXTRA_STYLE[variant],
        padding: noPadding ? 0 : undefined,
        ...hoverStyle,
        ...style,
      }}
      onMouseEnter={
        hover
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow =
                "0 8px 24px rgba(0,0,0,0.1)";
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
            }
          : undefined
      }
      onMouseLeave={
        hover
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = "";
              (e.currentTarget as HTMLDivElement).style.transform = "";
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  style,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        borderBottom: "1px solid var(--color-bg4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardBody({
  children,
  style,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={className}
      style={{ padding: "20px", ...style }}
    >
      {children}
    </div>
  );
}

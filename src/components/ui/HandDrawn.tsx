import type { CSSProperties } from "react";

/** PedalStart-style blue squiggly arrow pointing UP-RIGHT (↗) */
export function SquiggleArrowUpRight({
  color = "var(--color-primary)",
  size = 48,
  rotate = 0,
}: {
  color?: string;
  size?: number;
  rotate?: number;
}) {
  return (
    <svg
      width={size}
      height={Math.round((size * 40) / 48)}
      viewBox="0 0 48 40"
      fill="none"
      aria-hidden
      style={{
        transform: `rotate(${rotate}deg)`,
        flexShrink: 0,
      }}
    >
      {/* Wavy curve going up-right */}
      <path
        d="M 6 34 C 10 22, 18 24, 24 16 C 28 11, 34 10, 42 6"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrowhead */}
      <path
        d="M 32 5 L 42 6 L 39 16"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** PedalStart-style blue squiggly arrow pointing DOWN-LEFT (↙) */
export function SquiggleArrowDownLeft({
  color = "var(--color-primary)",
  size = 48,
  rotate = 0,
}: {
  color?: string;
  size?: number;
  rotate?: number;
}) {
  return (
    <svg
      width={size}
      height={Math.round((size * 40) / 48)}
      viewBox="0 0 48 40"
      fill="none"
      aria-hidden
      style={{
        transform: `rotate(${rotate}deg)`,
        flexShrink: 0,
      }}
    >
      {/* Wavy curve going down-left */}
      <path
        d="M 42 6 C 36 18, 28 16, 22 24 C 18 29, 12 30, 6 34"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrowhead */}
      <path
        d="M 16 34 L 6 34 L 9 24"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Small hand-drawn-style callout arrow, marker-sketch look. `flip` mirrors it horizontally. */
export function SquiggleArrow({
  flip = false,
  rotate = 0,
  color = "currentColor",
}: {
  flip?: boolean;
  rotate?: number;
  color?: string;
}) {
  return (
    <svg
      width="38"
      height="30"
      viewBox="0 0 38 30"
      fill="none"
      aria-hidden
      style={{
        transform: `${flip ? "scaleX(-1)" : ""} rotate(${rotate}deg)`,
        flexShrink: 0,
        color,
      }}
    >
      <path
        d="M3 3 C 14 2, 20 9, 17 15 C 14 21, 22 24, 34 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M26 16 L 34 21 L 27 26"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** PedalStart-style hand-drawn annotation: marker arrow + Caveat-set label. */
export function HandNote({
  label,
  flip,
  rotate = 0,
  direction,
  color = "var(--color-primary)",
  className = "hidden sm:flex animate-float",
  style,
}: {
  label: string;
  flip?: boolean;
  rotate?: number;
  direction?: "up-right" | "down-left";
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        alignItems: "center",
        gap: 6,
        color: color,
        zIndex: 2,
        pointerEvents: "none",
        ...style,
      }}
    >
      {direction === "up-right" ? (
        <>
          <SquiggleArrowUpRight color={color} rotate={rotate} />
          <span
            style={{
              fontFamily: "var(--font-hand)",
              fontSize: "clamp(18px, 2.2vw, 24px)",
              fontWeight: 600,
              color: color,
              whiteSpace: "nowrap",
              lineHeight: 1.1,
            }}
          >
            {label}
          </span>
        </>
      ) : direction === "down-left" ? (
        <>
          <SquiggleArrowDownLeft color={color} rotate={rotate} />
          <span
            style={{
              fontFamily: "var(--font-hand)",
              fontSize: "clamp(18px, 2.2vw, 24px)",
              fontWeight: 600,
              color: color,
              whiteSpace: "nowrap",
              lineHeight: 1.1,
            }}
          >
            {label}
          </span>
        </>
      ) : (
        <>
          <SquiggleArrow flip={flip} rotate={rotate} color={color} />
          <span
            style={{
              fontFamily: "var(--font-hand)",
              fontSize: "clamp(18px, 2.2vw, 24px)",
              fontWeight: 600,
              color: color,
              whiteSpace: "nowrap",
              lineHeight: 1.1,
            }}
          >
            {label}
          </span>
        </>
      )}
    </div>
  );
}


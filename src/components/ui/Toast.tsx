"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { IconCheck, IconX, IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";

const ICONS = {
  success: <IconCheck size={14} />,
  error:   <IconX size={14} />,
  warning: <IconAlertTriangle size={14} />,
  info:    <IconInfoCircle size={14} />,
};

const STYLES = {
  success: {
    background: "var(--color-bg2)",
    border: "1px solid var(--color-bg4)",
    iconBg: "var(--color-green-bg)",
    iconColor: "var(--color-green)",
    progressColor: "var(--color-green)",
  },
  error: {
    background: "var(--color-bg2)",
    border: "1px solid var(--color-bg4)",
    iconBg: "var(--color-red-bg)",
    iconColor: "var(--color-red)",
    progressColor: "var(--color-red)",
  },
  warning: {
    background: "var(--color-bg2)",
    border: "1px solid var(--color-bg4)",
    iconBg: "var(--color-amber-bg)",
    iconColor: "var(--color-amber)",
    progressColor: "var(--color-amber)",
  },
  info: {
    background: "var(--color-bg2)",
    border: "1px solid var(--color-bg4)",
    iconBg: "var(--color-blue-bg)",
    iconColor: "var(--color-blue)",
    progressColor: "var(--color-blue)",
  },
};

type ToastType = "success" | "error" | "warning" | "info";

function ToastItem({
  id,
  message,
  type,
}: {
  id: string;
  message: string;
  type: string;
}) {
  const { dismissToast } = useAppStore();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const toastType = (["success","error","warning","info"].includes(type) ? type : "info") as ToastType;
  const s = STYLES[toastType];

  useEffect(() => {
    // Trigger entrance
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  function handleDismiss() {
    setLeaving(true);
    setTimeout(() => dismissToast(id), 280);
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        borderRadius: "var(--radius-lg)",
        background: s.background,
        border: s.border,
        boxShadow: "0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)",
        minWidth: 280,
        maxWidth: 400,
        position: "relative",
        overflow: "hidden",
        opacity: visible && !leaving ? 1 : 0,
        transform: visible && !leaving ? "translateX(0)" : "translateX(48px)",
        transition: "opacity 280ms ease, transform 280ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Icon */}
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "var(--radius-md)",
          background: s.iconBg,
          color: s.iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {ICONS[toastType]}
      </span>

      {/* Message */}
      <p
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 500,
          color: "var(--color-text)",
          margin: 0,
          lineHeight: 1.5,
          paddingTop: 3,
        }}
      >
        {message}
      </p>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          borderRadius: "var(--radius-sm)",
          transition: "color var(--transition-fast), background var(--transition-fast)",
          flexShrink: 0,
          marginTop: 2,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text)";
          (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg3)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text4)";
          (e.currentTarget as HTMLButtonElement).style.background = "none";
        }}
      >
        <IconX size={13} />
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 2,
          borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
          background: s.progressColor,
          animation: "progressShrink 4s linear forwards",
          opacity: 0.5,
        }}
      />
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useAppStore();

  return (
    <div
      role="region"
      aria-label="Notifications"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        zIndex: "var(--z-toast)" as any,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: "auto" }}>
          <ToastItem
            id={t.id}
            message={t.message}
            type={t.type ?? "info"}
          />
        </div>
      ))}
    </div>
  );
}

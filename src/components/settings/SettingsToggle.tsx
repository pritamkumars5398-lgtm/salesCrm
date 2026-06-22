"use client";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
}

export default function SettingsToggle({ checked, onChange }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 transition-colors duration-200"
      style={{ width: 36, height: 20, borderRadius: 10, background: checked ? "#4f46e5" : "#cbd5e1", border: "none", cursor: "pointer", padding: 0 }}
    >
      <span
        style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s ease", display: "block",
        }}
      />
    </button>
  );
}

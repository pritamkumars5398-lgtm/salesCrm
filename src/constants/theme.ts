export const COLORS = {
  bg: "#ffffff",
  bg2: "#f8f9fa",
  bg3: "#f1f3f5",
  bg4: "#e9ecef",
  border: "rgba(0,0,0,0.1)",
  border2: "rgba(0,0,0,0.15)",
  text: "#111111",
  text2: "#495057",
  text3: "#868e96",
  accent: "#6c63ff",
  accent2: "#5b54d6",
  accentBg: "rgba(108,99,255,0.12)",
  green: "#22c97a",
  greenBg: "rgba(34,201,122,0.1)",
  amber: "#f5a623",
  amberBg: "rgba(245,166,35,0.1)",
  blue: "#4dabf7",
  blueBg: "rgba(77,171,247,0.1)",
  red: "#ff6b6b",
  redBg: "rgba(255,107,107,0.1)",
  purple: "#cc99ff",
  purpleBg: "rgba(204,153,255,0.1)",
} as const;

export const FONTS = {
  sans: "'DM Sans', sans-serif",
  mono: "'DM Mono', monospace",
} as const;

export const RADIUS = {
  sm: "8px",
  md: "10px",
  lg: "14px",
} as const;

export const STATUS_COLORS: Record<string, { pill: string; label: string }> = {
  new:            { pill: "bg-amber-50 text-amber-600",  label: "New" },
  in_outreach:    { pill: "bg-emerald-50 text-emerald-600",  label: "In outreach" },
  replied:        { pill: "bg-blue-50 text-blue-600",   label: "Replied" },
  meeting_booked: { pill: "bg-purple-50 text-purple-600", label: "Meeting booked" },
  manual:         { pill: "bg-red-50 text-red-600", label: "Manual" },
  closed:         { pill: "bg-emerald-50 text-emerald-600",  label: "Closed" },
};

export const CHANNEL_COLORS: Record<string, string> = {
  email:    "text-[#4dabf7] bg-[rgba(77,171,247,0.1)]",
  whatsapp: "text-[#22c97a] bg-[rgba(34,201,122,0.1)]",
  sms:      "text-[#cc99ff] bg-[rgba(204,153,255,0.1)]",
  call:     "text-[#f5a623] bg-[rgba(245,166,35,0.1)]",
};

export const CRON_PRESETS = [
  { label: "Every hour",      value: "0 * * * *" },
  { label: "Every 6 hours",   value: "0 */6 * * *" },
  { label: "Daily at 9 AM",   value: "0 9 * * *" },
  { label: "Daily at 10 AM",  value: "0 10 * * *" },
  { label: "Weekdays 9 AM",   value: "0 9 * * 1-5" },
  { label: "Weekdays 10 AM",  value: "0 10 * * 1-5" },
  { label: "Every Monday",    value: "0 9 * * 1" },
  { label: "Custom",          value: "custom" },
] as const;

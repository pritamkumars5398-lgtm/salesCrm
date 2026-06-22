export const STATUS_TABS = [
  { label: "All leads",      value: "all" },
  { label: "New",            value: "new" },
  { label: "In outreach",    value: "in_outreach" },
  { label: "Replied",        value: "replied" },
  { label: "Meeting booked", value: "meeting_booked" },
] as const;

export const SOURCE_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  "Google Maps": { label: "Google Maps",        color: "#10b981", bg: "rgba(16,185,129,0.1)",  dot: "#10b981" },
  "LinkedIn":    { label: "LinkedIn",           color: "#0a66c2", bg: "rgba(10,102,194,0.1)",  dot: "#0a66c2" },
  "JustDial":    { label: "JustDial",           color: "#f58220", bg: "rgba(245,130,32,0.1)",  dot: "#f58220" },
  "Apify":       { label: "Apify (Google Maps)",color: "#6366f1", bg: "rgba(99,102,241,0.1)",  dot: "#6366f1" },
  "Manual":      { label: "Manual",             color: "#94a3b8", bg: "rgba(148,163,184,0.1)", dot: "#94a3b8" },
  "Referral":    { label: "Referral",           color: "#f43f5e", bg: "rgba(244,63,94,0.1)",   dot: "#f43f5e" },
};

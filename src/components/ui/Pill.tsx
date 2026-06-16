import { STATUS_COLORS } from "@/constants/theme";

interface Props {
  status: string;
  label?: string;
}

export default function StatusPill({ status, label }: Props) {
  const cfg = STATUS_COLORS[status] ?? { pill: "bg-slate-50 text-slate-600", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase shadow-sm border border-black/5 ${cfg.pill}`}>
      {label ?? cfg.label}
    </span>
  );
}

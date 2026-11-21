"use client";
import Link from "next/link";
import { PLANS, type PlanId } from "@/lib/plans";
import { FEATURE_LABEL, TOPUP_FIELDS as ALL_TOPUP_FIELDS, type TopUpField } from "@/lib/topups";
import { SMS_COMING_SOON } from "@/lib/constants/coming-soon";

export type ClientStatus = "active" | "expiring" | "expired" | "free";

export const LIMIT_KEY: Record<TopUpField, string> = {
  callsMade: "callsPerMonth",
  messagesSent: "messagesPerMonth",
  smsSent: "smsPerMonth",
  emailsSent: "emailsPerMonth",
  leadsScraped: "leadsPerMonth",
  assistantTokens: "assistantTokensPerMonth",
};

/** Features shown in the admin panel (SMS is hidden while it's coming soon). */
export const TOPUP_FIELDS = ALL_TOPUP_FIELDS.filter((f) => !(SMS_COMING_SOON && f === "smsSent"));

export { FEATURE_LABEL };

const STATUS: Record<ClientStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "#10b981" },
  expiring: { label: "Ends soon", color: "#f59e0b" },
  expired: { label: "Expired", color: "#ef4444" },
  free: { label: "Free", color: "#94a3b8" },
};

export function StatusPill({ status }: { status: ClientStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap" style={{ background: `${s.color}1f`, color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} /> {s.label}
    </span>
  );
}

export function PlanPill({ plan }: { plan: PlanId }) {
  const p = PLANS[plan] ?? PLANS.free;
  return <span className="px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap" style={{ background: `${p.color}1f`, color: p.color }}>{p.name}</span>;
}

export function Stat({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-2xl border border-bg4 bg-bg2 p-4 flex flex-col gap-1 min-w-0">
      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-text3">{label}</span>
      <span className="text-[24px] font-bold leading-tight" style={{ color: color ?? "var(--color-text)" }}>{value}</span>
      {sub && <span className="text-[12px] text-text3">{sub}</span>}
    </div>
  );
}

export function Card({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-bg4 bg-bg2 p-5 flex flex-col gap-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold text-text m-0">{title}</h3>
          {sub && <p className="text-[12.5px] text-text3 m-0 mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function UsageBar({ used, limit, extra = 0 }: { used: number; limit: number; extra?: number }) {
  if (limit === 0) return <span className="text-[11.5px] font-semibold" style={{ color: "#ef4444" }}>Off</span>;
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const color = limit === -1 ? "#10b981" : pct >= 100 ? "#ef4444" : pct >= 80 ? "#f59e0b" : "#10b981";
  return (
    <div className="flex flex-col gap-1 min-w-[90px]">
      <span className="text-[11.5px] text-text2 font-mono whitespace-nowrap">
        {used.toLocaleString("en-IN")}{limit === -1 ? " · ∞" : ` / ${limit.toLocaleString("en-IN")}`}
        {extra > 0 && <span style={{ color: "#10b981" }}> +{extra.toLocaleString("en-IN")}</span>}
      </span>
      {limit !== -1 && (
        <div className="h-1.5 rounded-full bg-bg4 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

export function PageHeader({ title, sub, back, action }: { title: string; sub?: React.ReactNode; back?: { href: string; label: string }; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {back && <Link href={back.href} className="text-[12.5px] text-text3 no-underline hover:text-text">← {back.label}</Link>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-[22px] font-bold text-text m-0">{title}</h1>
        {action}
      </div>
      {sub && <div className="text-[13px] text-text3">{sub}</div>}
    </div>
  );
}

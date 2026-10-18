"use client";
import { IconAlertTriangle, IconCalendarTime, IconClockHour4 } from "@tabler/icons-react";
import { PLANS, type PlanId } from "@/lib/plans";

export interface BillingPlan {
  current: PlanId;
  purchased: PlanId;
  expiresAt: string | null;
  expired: boolean;
  daysLeft: number | null;
}

interface Props {
  plan: BillingPlan;
  canPay: boolean;
  paymentsEnabled: boolean;
  busy: boolean;
  onRenew: (planId: PlanId) => void;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Where the prepaid period stands: days left, ended (back on Free), or no expiry. */
export default function PlanStatusBanner({ plan, canPay, paymentsEnabled, busy, onRenew }: Props) {
  const purchased = PLANS[plan.purchased];
  const renewable = plan.purchased !== "free" && canPay && paymentsEnabled;

  let tone: "ok" | "warn" | "ended" = "ok";
  let Icon = IconCalendarTime;
  let title = "";
  let detail = "";

  if (plan.purchased === "free") {
    title = "You're on the Free plan";
    detail = "Paid plans are prepaid for 30 days at a time — pay again when a period ends to keep going.";
  } else if (plan.expired && plan.expiresAt) {
    tone = "ended";
    Icon = IconAlertTriangle;
    title = `Your ${purchased.name} plan ended on ${fmt(plan.expiresAt)} — you're on Free now`;
    detail = `Free limits apply until you pay for another 30 days of ${purchased.name} (or any plan).`;
  } else if (plan.expiresAt) {
    const days = plan.daysLeft ?? 0;
    tone = days <= 3 ? "warn" : "ok";
    Icon = IconClockHour4;
    title = `${purchased.name} plan — ${days} day${days === 1 ? "" : "s"} left`;
    detail = `Active until ${fmt(plan.expiresAt)}. After that you're moved to Free automatically. Paying for ${purchased.name} again adds 30 days to the end date.`;
  } else {
    title = `${purchased.name} plan — no expiry`;
    detail = "This plan was assigned by the SalesAgent team and doesn't run out.";
  }

  const colors = {
    ok: { border: `${purchased.color}55`, bg: `${purchased.color}12`, icon: purchased.color },
    warn: { border: "rgba(245,158,11,0.45)", bg: "rgba(245,158,11,0.08)", icon: "#f59e0b" },
    ended: { border: "rgba(239,68,68,0.45)", bg: "rgba(239,68,68,0.08)", icon: "#ef4444" },
  }[tone];

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4"
      style={{ border: `1px solid ${colors.border}`, background: colors.bg }}
    >
      <Icon size={20} style={{ color: colors.icon, flexShrink: 0 }} />
      <div className="min-w-[220px] flex-1">
        <p className="text-[14px] font-bold text-text">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-text3">{detail}</p>
      </div>
      {renewable && (plan.expired || (plan.daysLeft ?? 99) <= 7) && (
        <button
          onClick={() => onRenew(plan.purchased)}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${purchased.color}, ${purchased.color}cc)` }}
        >
          {plan.expired ? `Renew ${purchased.name}` : "Extend 30 days"} · ₹{purchased.priceINR.toLocaleString("en-IN")}
        </button>
      )}
      {!canPay && plan.purchased !== "free" && (
        <p className="w-full text-[11.5px] text-text3">Only the organization owner can pay for or change the plan.</p>
      )}
    </div>
  );
}

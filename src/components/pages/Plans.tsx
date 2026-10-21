"use client";
import { useCallback, useEffect, useState } from "react";
import { IconCheck, IconBolt, IconTrendingUp, IconCrown, IconRocket } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { PLANS, type PlanId, type Plan, type PlanLimits } from "@/lib/plans";
import { apiFetch, apiGet, apiPost } from "@/lib/api/client";
import { openRazorpayCheckout, type CheckoutOrder } from "@/lib/razorpay-checkout";
import PlanStatusBanner, { type BillingPlan } from "@/components/billing/PlanStatusBanner";
import PaymentHistory, { type PaymentRow } from "@/components/billing/PaymentHistory";

interface BillingData {
  enabled: boolean;
  mode?: "real" | "fake";
  canPay: boolean;
  plan: BillingPlan | null;
  payments: PaymentRow[];
}

interface UsageData {
  planId: PlanId;
  plan: Plan & { limits: PlanLimits };
  usage: { leadsScraped: number; messagesSent: number; callsMade: number; emailsSent: number; smsSent: number };
  month: string;
}

const PLAN_ICONS: Record<PlanId, React.ElementType> = {
  free: IconBolt,
  starter: IconTrendingUp,
  growth: IconRocket,
  pro: IconCrown,
};

function UsageMeter({ label, used, limit, color }: { label: string; used: number; limit: number; color: string }) {
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const isNear = pct >= 80;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-text2)", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: isNear ? "#ef4444" : "var(--color-text3)", fontWeight: 600 }}>
          {limit === -1 ? `${used.toLocaleString()} used · Unlimited` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--color-bg4)", overflow: "hidden" }}>
        {/* Unlimited: nothing to fill up, so no bar */}
        <div style={{
          height: "100%",
          width: limit === -1 ? "0%" : `${pct}%`,
          borderRadius: 99,
          background: isNear ? "#ef4444" : color,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

function PlanCard({
  planId, currentPlanId, onSelect, busy, canPay, paymentsEnabled, isFake,
}: {
  planId: PlanId;
  currentPlanId: PlanId;
  onSelect: (id: PlanId) => void;
  busy: boolean;
  canPay: boolean;
  paymentsEnabled: boolean;
  isFake?: boolean;
}) {
  const plan = PLANS[planId];
  const Icon = PLAN_ICONS[planId];
  const isCurrent = planId === currentPlanId;
  const isDowngrade = Object.keys(PLANS).indexOf(planId) < Object.keys(PLANS).indexOf(currentPlanId);
  const blocked = !canPay || (planId !== "free" && !paymentsEnabled);
  const label = busy ? (isFake ? "Activating…" : "Opening…")
    : planId === "free" ? "Switch to Free"
      : isFake
        ? (isCurrent ? "Extend 30 days (Direct)" : `${isDowngrade ? "Switch" : "Upgrade"} (Direct / Fake)`)
        : isCurrent ? `Extend 30 days · ₹${plan.priceINR.toLocaleString("en-IN")}`
          : `${isDowngrade ? "Switch" : "Upgrade"} · Pay ₹${plan.priceINR.toLocaleString("en-IN")}`;

  return (
    <div style={{
      border: `1.5px solid ${isCurrent ? plan.color : "var(--color-bg4)"}`,
      borderRadius: 16,
      padding: "24px 20px",
      background: isCurrent ? `${plan.color}0d` : "var(--color-bg2)",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      boxShadow: isCurrent ? `0 0 0 3px ${plan.color}22` : "none",
      transition: "box-shadow 0.2s",
    }}>
      {plan.badge && (
        <div style={{
          position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)",
          padding: "2px 12px", borderRadius: 99, fontSize: 10.5, fontWeight: 800,
          background: plan.color, color: "#fff", letterSpacing: "0.05em", whiteSpace: "nowrap",
        }}>
          {plan.badge}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          background: `${plan.color}18`,
        }}>
          <Icon size={18} style={{ color: plan.color }} />
        </span>
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: "var(--color-text)", margin: 0 }}>{plan.name}</p>
          <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>
            {plan.priceINR === 0 ? "Free forever" : `₹${plan.priceINR.toLocaleString()}/month`}
          </p>
        </div>
        {isCurrent && (
          <span style={{
            marginLeft: "auto", padding: "2px 10px", borderRadius: 99,
            background: `${plan.color}18`, color: plan.color,
            fontSize: 10.5, fontWeight: 700,
          }}>
            Current
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.features.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <IconCheck size={13} style={{ color: plan.color, marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: "var(--color-text2)", lineHeight: 1.4 }}>{f}</span>
          </div>
        ))}
      </div>

      {!(isCurrent && planId === "free") && (
        <button
          disabled={busy || blocked}
          title={!canPay ? "Only the organization owner can change the plan" : blocked ? "Online payments aren't set up yet" : undefined}
          onClick={() => onSelect(planId)}
          style={{
            marginTop: "auto",
            padding: "9px 0",
            borderRadius: 10,
            background: isDowngrade ? "var(--color-bg3)" : `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`,
            color: isDowngrade ? "var(--color-text2)" : "#fff",
            fontSize: 13, fontWeight: 700,
            border: "none", cursor: busy ? "wait" : blocked ? "not-allowed" : "pointer",
            opacity: busy || blocked ? 0.6 : 1,
          }}
        >
          {label}
        </button>
      )}
    </div>
  );
}

export default function Plans() {
  const { activeAgent, agents, showToast, isSuperadmin } = useAppStore();
  const [data, setData] = useState<UsageData | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!activeAgent) return;
    apiGet<UsageData>(`/api/usage?agentId=${activeAgent._id}`).then(setData).catch(() => {});
    apiGet<BillingData>(`/api/billing?agentId=${activeAgent._id}`).then(setBilling).catch(() => {});
  }, [activeAgent?._id]);

  useEffect(() => { load(); }, [load]);

  /** What the new plan's limits mean for this month's usage and workspace count. */
  function limitWarnings(planId: PlanId): string {
    if (!data || !activeAgent) return "";
    const next = PLANS[planId].limits;
    const over: string[] = [];
    const check = (label: string, used: number, max: number) => {
      if (max !== -1 && used >= max) over.push(`${label}: ${used} used this month, new limit ${max}`);
    };
    check("Leads", data.usage.leadsScraped, next.leadsPerMonth);
    check("WhatsApp messages", data.usage.messagesSent, next.messagesPerMonth);
    check("Emails", data.usage.emailsSent, next.emailsPerMonth);
    check("SMS", data.usage.smsSent, next.smsPerMonth);
    check("AI calls", data.usage.callsMade, next.callsPerMonth);
    const orgWorkspaces = agents.filter((a) => a.organizationId === activeAgent.organizationId).length;
    const workspaceNote = next.workspaces !== -1 && orgWorkspaces > next.workspaces
      ? `\n\nYou have ${orgWorkspaces} workspaces; ${PLANS[planId].name} allows ${next.workspaces}. None are deleted, but you can't add new ones.`
      : "";
    const overNote = over.length ? `\n\nAlready over the new limits — these stop until next month:\n• ${over.join("\n• ")}` : "";
    return overNote + workspaceNote;
  }

  async function switchToFree() {
    if (!activeAgent) return;
    const days = billing?.plan && !billing.plan.expired ? billing.plan.daysLeft : null;
    const lose = days && billing?.plan?.purchased !== "free"
      ? `\n\nYou still have ${days} paid day${days === 1 ? "" : "s"} of ${PLANS[billing!.plan!.purchased].name} — they're lost (no refund).`
      : "";
    if (!window.confirm(`Switch to Free now?${lose}${limitWarnings("free")}`)) return;
    setBusy(true);
    try {
      await apiFetch("/api/usage", { method: "PATCH", body: JSON.stringify({ agentId: activeAgent._id, planId: "free" }) });
      showToast("You're on the Free plan now.", "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not change the plan.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function pay(planId: PlanId) {
    if (!activeAgent || !billing) return;
    const current = billing.plan;
    const order = Object.keys(PLANS) as PlanId[];
    if (current && !current.expired && current.purchased !== "free" && current.purchased !== planId && current.daysLeft) {
      const credit = Math.floor(current.daysLeft * PLANS[current.purchased].priceINR / PLANS[planId].priceINR);
      const downgrade = order.indexOf(planId) < order.indexOf(current.purchased);
      const msg = `Switch from ${PLANS[current.purchased].name} to ${PLANS[planId].name}?\n\n`
        + `${PLANS[planId].name} starts as soon as you pay, for 30 days`
        + (credit > 0 ? ` + about ${credit} extra day${credit === 1 ? "" : "s"} from your unused ${PLANS[current.purchased].name} time.` : ".")
        + (downgrade ? limitWarnings(planId) : "");
      if (!window.confirm(msg)) return;
    }
    setBusy(true);
    try {
      const checkout = await apiPost<CheckoutOrder & { fake?: boolean; planId?: PlanId; periodEnd?: string }>("/api/billing/order", { agentId: activeAgent._id, planId });
      if (checkout.fake) {
        const endFormatted = checkout.periodEnd
          ? new Date(checkout.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "30 days";
        showToast(`Direct subscription activated (Fake Mode) — ${PLANS[checkout.planId || planId].name} is active until ${endFormatted}.`, "success");
        load();
        return;
      }
      const result = await openRazorpayCheckout(checkout, (reason) => showToast(`Payment failed: ${reason} — you can try again in the same window.`, "error"));
      if (!result) {
        showToast("Payment window closed — nothing was charged.");
        return;
      }
      const done = await apiPost<{ planId: PlanId; periodEnd: string }>("/api/billing/verify", { agentId: activeAgent._id, ...result });
      showToast(`Payment received — ${PLANS[done.planId].name} is active until ${new Date(done.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`, "success");
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Payment couldn't be completed.", "error");
      // If money was taken but confirmation failed here, Razorpay's webhook still applies it.
      load();
    } finally {
      setBusy(false);
    }
  }

  function handleSelect(planId: PlanId) {
    if (busy) return;
    if (planId === "free") switchToFree();
    else pay(planId);
  }

  if (!data) {
    return <div style={{ padding: 40, color: "var(--color-text3)", fontSize: 13 }}>Loading…</div>;
  }

  const { planId, usage } = data;
  const plan = PLANS[planId];
  const limits = data.plan.limits;

  return (
    <div style={{ maxWidth: 900, padding: "28px 28px 60px" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text)", margin: "0 0 6px" }}>
          Plans & Usage
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0 }}>
          {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })} usage · BYOK — bring your own Apify, Twilio and Vapi keys.
        </p>
      </div>

      {billing?.plan && (
        <PlanStatusBanner
          plan={billing.plan}
          canPay={billing.canPay}
          paymentsEnabled={billing.enabled}
          busy={busy}
          onRenew={(id) => pay(id)}
        />
      )}
      {billing && !billing.enabled && (
        <p className="mb-4 text-[12px] text-text3">Online payments aren&apos;t set up yet — add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the server&apos;s .env.</p>
      )}
      {billing?.mode === "fake" && (
        <div style={{
          marginBottom: 20,
          padding: "10px 16px",
          borderRadius: 10,
          background: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          color: "#10b981",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span>⚡</span>
          <span><strong>Fake Payment Mode Active (.env):</strong> Clicking any plan will directly activate the 30-day subscription without Razorpay.</span>
        </div>
      )}

      {/* Usage meters */}
      <div style={{
        background: "var(--color-bg2)",
        border: "1px solid var(--color-bg4)",
        borderRadius: 16, padding: "20px 22px", marginBottom: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{
            width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: `${plan.color}18`,
          }}>
            {(() => { const Icon = PLAN_ICONS[planId]; return <Icon size={15} style={{ color: plan.color }} />; })()}
          </span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
              {plan.name} Plan
              {plan.priceINR > 0 && <span style={{ fontSize: 11, color: "var(--color-text3)", fontWeight: 400, marginLeft: 6 }}>₹{plan.priceINR.toLocaleString()}/mo</span>}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>This month's consumption</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 28px" }}>
          <UsageMeter label="Monthly leads quota" used={usage.leadsScraped} limit={limits.leadsPerMonth} color={plan.color} />
          <UsageMeter label="WhatsApp messages" used={usage.messagesSent} limit={limits.messagesPerMonth} color={plan.color} />
          <UsageMeter label="AI calls" used={usage.callsMade} limit={limits.callsPerMonth} color={plan.color} />
          <UsageMeter label="Emails sent" used={usage.emailsSent} limit={limits.emailsPerMonth} color={plan.color} />
          <UsageMeter label="SMS sent" used={usage.smsSent} limit={limits.smsPerMonth} color={plan.color} />
        </div>
      </div>

      {/* Plan cards */}
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", marginBottom: 14 }}>
        Choose a plan
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {(Object.keys(PLANS) as PlanId[]).map((id) => (
          <PlanCard
            key={id}
            planId={id}
            currentPlanId={planId}
            onSelect={handleSelect}
            busy={busy}
            canPay={billing?.canPay ?? false}
            paymentsEnabled={billing?.enabled ?? false}
            isFake={billing?.mode === "fake"}
          />
        ))}
      </div>

      <PaymentHistory payments={billing?.payments ?? []} />

      {/* Revenue context — the platform's own numbers, not for customers */}
      {isSuperadmin && <div style={{
        marginTop: 32, padding: "18px 20px",
        background: "rgba(223,42,42,0.05)",
        border: "1px solid rgba(223,42,42,0.15)",
        borderRadius: 12,
      }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: "#df2a2a", margin: "0 0 8px" }}>
          SalesAgent Economics (your SaaS math)
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { label: "500 free users → 10% convert", value: "₹1,12,430 MRR" },
            { label: "2,000 free users → 10% convert", value: "₹4,49,720 MRR" },
            { label: "Fixed infra cost", value: "₹7,300/mo" },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: "10px 14px", background: "var(--color-bg2)", borderRadius: 10 }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text)", margin: "0 0 3px" }}>{value}</p>
              <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>{label}</p>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}


"use client";
import { useEffect, useState } from "react";
import { IconCheck, IconBolt, IconTrendingUp, IconCrown, IconRocket } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { PLANS, type PlanId, type Plan } from "@/lib/plans";

interface UsageData {
  planId: PlanId;
  plan: Plan;
  usage: { leadsScraped: number; messagesSent: number; callsMade: number; emailsSent: number };
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
          {used.toLocaleString()} / {limit === -1 ? "∞" : limit.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--color-bg4)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: limit === -1 ? "5%" : `${pct}%`,
          borderRadius: 99,
          background: isNear ? "#ef4444" : color,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

function PlanCard({
  planId, currentPlanId, onUpgrade, upgrading,
}: {
  planId: PlanId;
  currentPlanId: PlanId;
  onUpgrade: (id: PlanId) => void;
  upgrading: boolean;
}) {
  const plan = PLANS[planId];
  const Icon = PLAN_ICONS[planId];
  const isCurrent = planId === currentPlanId;
  const isDowngrade = Object.keys(PLANS).indexOf(planId) < Object.keys(PLANS).indexOf(currentPlanId);

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

      {!isCurrent && (
        <button
          disabled={upgrading || isDowngrade}
          onClick={() => onUpgrade(planId)}
          style={{
            marginTop: "auto",
            padding: "9px 0",
            borderRadius: 10,
            background: isDowngrade ? "var(--color-bg3)" : `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`,
            color: isDowngrade ? "var(--color-text3)" : "#fff",
            fontSize: 13, fontWeight: 700,
            border: "none", cursor: isDowngrade ? "not-allowed" : "pointer",
            opacity: upgrading ? 0.6 : 1,
          }}
        >
          {isDowngrade ? "Downgrade" : upgrading ? "Upgrading…" : `Upgrade to ${plan.name}`}
        </button>
      )}
    </div>
  );
}

export default function Plans() {
  const { activeAgent, showToast } = useAppStore();
  const [data, setData] = useState<UsageData | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/usage?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then(setData);
  }, [activeAgent?._id]);

  async function handleUpgrade(planId: PlanId) {
    if (!activeAgent || upgrading) return;
    setUpgrading(true);
    try {
      const res = await fetch("/api/usage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, planId }),
      });
      if (res.ok) {
        setData((prev) => prev ? { ...prev, planId, plan: { ...prev.plan, ...PLANS[planId] } } : prev);
        showToast(`Upgraded to ${PLANS[planId].name}!`, "success");
      }
    } finally {
      setUpgrading(false);
    }
  }

  if (!data) {
    return <div style={{ padding: 40, color: "var(--color-text3)", fontSize: 13 }}>Loading…</div>;
  }

  const { planId, usage } = data;
  const plan = PLANS[planId];

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
          <UsageMeter label="Leads scraped" used={usage.leadsScraped} limit={plan.limits.leadsPerMonth} color={plan.color} />
          <UsageMeter label="WhatsApp messages" used={usage.messagesSent} limit={plan.limits.messagesPerMonth} color={plan.color} />
          <UsageMeter label="AI calls" used={usage.callsMade} limit={plan.limits.callsPerMonth} color={plan.color} />
          <UsageMeter label="Emails sent" used={usage.emailsSent} limit={plan.limits.emailsPerMonth} color={plan.color} />
        </div>
      </div>

      {/* Plan cards */}
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", marginBottom: 14 }}>
        Choose a plan
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {(Object.keys(PLANS) as PlanId[]).map((id) => (
          <PlanCard key={id} planId={id} currentPlanId={planId} onUpgrade={handleUpgrade} upgrading={upgrading} />
        ))}
      </div>

      {/* Revenue context */}
      <div style={{
        marginTop: 32, padding: "18px 20px",
        background: "rgba(99,102,241,0.05)",
        border: "1px solid rgba(99,102,241,0.15)",
        borderRadius: 12,
      }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: "#6366f1", margin: "0 0 8px" }}>
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
      </div>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconAlertTriangle, IconX, IconCrown } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { FEATURE_LABEL, TOPUP_FIELDS, TOPUP_PACKS, type TopUpField, type TopUpCredits } from "@/lib/topups";
import { USAGE_CHANGED_EVENT } from "@/lib/topup-checkout";
import { isComingSoonChannel } from "@/lib/constants/coming-soon";
import TopUpPacks, { FEATURE_ICON } from "@/components/billing/TopUpPacks";

interface UsageData {
  month: string;
  plan: { name: string; limits: Record<string, number> };
  usage: Record<TopUpField, number>;
  credits?: TopUpCredits;
  canBuy?: boolean;
}

const LIMIT_KEY: Record<TopUpField, string> = {
  leadsScraped: "leadsPerMonth",
  messagesSent: "messagesPerMonth",
  callsMade: "callsPerMonth",
  emailsSent: "emailsPerMonth",
  smsSent: "smsPerMonth",
  assistantTokens: "assistantTokensPerMonth",
};

type Alert = { field: TopUpField; used: number; limit: number; level: "near" | "out" };

const REFRESH_MS = 5 * 60_000;

function sessionGet(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessionSet(key: string) {
  try { sessionStorage.setItem(key, "1"); } catch { /* private mode */ }
}

/** First day of next month, e.g. "1 Dec" — when monthly limits reset. */
function resetDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 1).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * App-wide usage warnings: a slim banner when a monthly limit is 80% used, and a
 * popup (once per session) when it's used up — with top-up packs and an upgrade link.
 */
export default function UsageAlerts() {
  const { activeAgent, currentPage } = useAppStore();
  const router = useRouter();
  const [data, setData] = useState<UsageData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [popup, setPopup] = useState<Alert | null>(null);

  const load = useCallback(() => {
    if (!activeAgent) return;
    fetch(`/api/usage?agentId=${activeAgent._id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [activeAgent?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener(USAGE_CHANGED_EVENT, load);
    window.addEventListener("crm:data-changed", load);
    return () => {
      clearInterval(t);
      window.removeEventListener(USAGE_CHANGED_EVENT, load);
      window.removeEventListener("crm:data-changed", load);
    };
  }, [load]);

  const alerts: Alert[] = [];
  if (data) {
    for (const field of TOPUP_FIELDS) {
      if (field === "smsSent" && isComingSoonChannel("sms")) continue;
      const limit = data.plan.limits[LIMIT_KEY[field]];
      const used = data.usage[field] ?? 0;
      const extra = data.credits?.[field] ?? 0;
      if (limit === undefined || limit === -1 || limit === 0 || extra > 0) continue;
      if (used >= limit) alerts.push({ field, used, limit, level: "out" });
      else if (used >= limit * 0.8) alerts.push({ field, used, limit, level: "near" });
    }
  }
  const signature = data ? `${data.month}:${alerts.map((a) => `${a.field}-${a.level}`).join(",")}` : "";

  // Banner: hide again only until something new crosses a line.
  useEffect(() => {
    setDismissed(!!signature && sessionGet(`usageBanner:${signature}`) === "1");
  }, [signature]);

  // Popup: once per session for each feature that just ran out.
  useEffect(() => {
    if (!data || popup || currentPage === "plans") return;
    const out = alerts.find((a) => a.level === "out" && sessionGet(`limitPopup:${data.month}:${a.field}`) !== "1");
    if (out) {
      sessionSet(`limitPopup:${data.month}:${out.field}`);
      setPopup(out);
    }
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !activeAgent) return null;
  const goPlans = () => router.push(`/plans/${activeAgent._id}`);
  const canTopUp = (f: TopUpField) => TOPUP_PACKS.some((p) => p.field === f);

  const worst = alerts.find((a) => a.level === "out") ?? alerts[0];
  const banner = worst && !dismissed && currentPage !== "plans" && (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[12.5px] border-b"
      style={{
        background: worst.level === "out" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
        borderColor: worst.level === "out" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)",
        color: "var(--color-text)",
      }}
    >
      <IconAlertTriangle size={15} style={{ color: worst.level === "out" ? "#ef4444" : "#f59e0b", flexShrink: 0 }} />
      <span className="flex-1 min-w-0">
        {alerts.map((a) => (
          <span key={a.field} className="mr-3">
            {a.level === "out"
              ? <><strong>{FEATURE_LABEL[a.field].name}</strong> used up for this month ({a.used}/{a.limit})</>
              : <><strong>{FEATURE_LABEL[a.field].name}</strong>: {a.used} of {a.limit} used</>}
          </span>
        ))}
        <span className="text-text3">· resets {resetDay(data.month)}</span>
      </span>
      {canTopUp(worst.field) && (
        <button type="button" onClick={() => setPopup(worst)} className="shrink-0 px-2.5 py-1 rounded-md text-[12px] font-bold text-white border-none cursor-pointer" style={{ background: "#df2a2a" }}>
          Top up
        </button>
      )}
      <button type="button" onClick={goPlans} className="shrink-0 px-2.5 py-1 rounded-md text-[12px] font-semibold bg-bg2 border border-bg4 text-text cursor-pointer">
        Upgrade
      </button>
      <button type="button" aria-label="Hide" onClick={() => { sessionSet(`usageBanner:${signature}`); setDismissed(true); }} className="shrink-0 p-1 bg-transparent border-none cursor-pointer text-text3">
        <IconX size={14} />
      </button>
    </div>
  );

  const modal = popup && createPortal(
    <div onClick={() => setPopup(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-2xl border border-bg4 bg-bg2 p-5 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-start gap-3">
          {(() => { const { Icon, color } = FEATURE_ICON[popup.field]; return (
            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}><Icon size={20} /></span>
          ); })()}
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-bold text-text m-0">
              {popup.level === "out" ? `You've used all your ${FEATURE_LABEL[popup.field].name}` : `${FEATURE_LABEL[popup.field].name} almost used up`}
            </h3>
            <p className="text-[12.5px] text-text3 m-0 mt-1">
              {popup.used} of {popup.limit} used on the {data.plan.name} plan this month.{" "}
              {popup.level === "out" ? `They stop until ${resetDay(data.month)} — top up to keep going now, or move to a bigger plan.` : "Top up now so nothing stops."}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setPopup(null)} className="p-1 bg-transparent border-none cursor-pointer text-text3"><IconX size={16} /></button>
        </div>
        {canTopUp(popup.field) && (
          <TopUpPacks only={popup.field} credits={data.credits} canBuy={!!data.canBuy} onBought={() => setPopup(null)} />
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setPopup(null); goPlans(); }} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white border-none cursor-pointer" style={{ background: "linear-gradient(135deg,#8b5cf6,#6366f1)" }}>
            <IconCrown size={15} /> See bigger plans
          </button>
          <button type="button" onClick={() => setPopup(null)} className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-bg3 border border-bg4 text-text2 cursor-pointer">Not now</button>
        </div>
      </div>
    </div>,
    document.body,
  );

  return <>{banner}{modal}</>;
}

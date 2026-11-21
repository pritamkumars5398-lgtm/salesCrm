"use client";
import { useState } from "react";
import { IconPhone, IconBrandWhatsapp, IconMessage, IconMail, IconUsers, IconPlus, IconSparkles } from "@tabler/icons-react";
import { TOPUP_PACKS, FEATURE_LABEL, TOPUP_FIELDS, type TopUpField, type TopUpCredits } from "@/lib/topups";
import { buyTopUp } from "@/lib/topup-checkout";
import { useAppStore } from "@/store/useAppStore";

export const FEATURE_ICON: Record<TopUpField, { Icon: React.ElementType; color: string }> = {
  callsMade: { Icon: IconPhone, color: "#f5a623" },
  messagesSent: { Icon: IconBrandWhatsapp, color: "#22c97a" },
  smsSent: { Icon: IconMessage, color: "#cc99ff" },
  emailsSent: { Icon: IconMail, color: "#4dabf7" },
  leadsScraped: { Icon: IconUsers, color: "#df2a2a" },
  assistantTokens: { Icon: IconSparkles, color: "#8b5cf6" },
};

/** Packs to buy, grouped by feature. `only` limits it to one feature (used in the limit popup). */
export default function TopUpPacks({ credits, canBuy, only, onBought }: {
  credits?: Partial<TopUpCredits>;
  canBuy: boolean;
  only?: TopUpField;
  onBought?: () => void;
}) {
  const { activeAgent, showToast } = useAppStore();
  const [busy, setBusy] = useState<string | null>(null);
  const fields = only ? [only] : TOPUP_FIELDS.filter((f) => TOPUP_PACKS.some((p) => p.field === f));

  async function buy(packId: string) {
    if (!activeAgent || busy) return;
    setBusy(packId);
    const ok = await buyTopUp(activeAgent._id, packId, showToast);
    setBusy(null);
    if (ok) onBought?.();
  }

  return (
    <div className={`grid gap-3 ${only ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
      {fields.map((field) => {
        const { Icon, color } = FEATURE_ICON[field];
        const left = credits?.[field] ?? 0;
        return (
          <div key={field} className="rounded-xl border border-bg4 bg-bg2 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}>
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-text m-0">{FEATURE_LABEL[field].name}</p>
                <p className="text-[11.5px] text-text3 m-0">{left > 0 ? `${left.toLocaleString("en-IN")} extra left` : "No extra credits"}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {TOPUP_PACKS.filter((p) => p.field === field).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!canBuy || !!busy}
                  onClick={() => buy(p.id)}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-bg4 bg-bg3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left hover:border-[#df2a2a]"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                    <IconPlus size={13} /> {p.units.toLocaleString("en-IN")} {FEATURE_LABEL[field].unit}
                  </span>
                  <span className="text-[13px] font-bold" style={{ color: "#df2a2a" }}>
                    {busy === p.id ? "…" : `₹${p.priceINR.toLocaleString("en-IN")}`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!canBuy && <p className="text-[12px] text-text3 m-0 sm:col-span-2 lg:col-span-3">Only the organization owner can buy top-ups.</p>}
    </div>
  );
}

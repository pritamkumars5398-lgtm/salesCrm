"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PLANS, type PlanId } from "@/lib/plans";
import type { TopUpField } from "@/lib/topups";
import { PageHeader, Stat, inr, fmtDate, FEATURE_LABEL } from "./ui";

interface Row {
  id: string; clientId: string; client: string; kind: string; planId?: PlanId; topUpField?: TopUpField; topUpUnits?: number;
  amount: number; status: string; createdAt: string; periodEnd?: string; fake: boolean; failureReason?: string;
}

export default function AdminPayments() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [kind, setKind] = useState<"all" | "plan" | "topup" | "failed">("all");
  useEffect(() => { fetch("/api/admin/payments").then((r) => r.json()).then((d) => setRows(d.payments ?? [])).catch(() => setRows([])); }, []);
  const shown = useMemo(() => (rows ?? []).filter((r) => kind === "all" || (kind === "failed" ? r.status !== "paid" : r.kind === kind && r.status === "paid")), [rows, kind]);
  const paid = (rows ?? []).filter((r) => r.status === "paid" && !r.fake);

  return (
    <>
      <PageHeader title="Payments" sub="Every plan and top-up payment across clients" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total received" value={inr(paid.reduce((s, r) => s + r.amount, 0))} color="#f59e0b" sub="real payments only" />
        <Stat label="Plans" value={inr(paid.filter((r) => r.kind !== "topup").reduce((s, r) => s + r.amount, 0))} />
        <Stat label="Top-ups" value={inr(paid.filter((r) => r.kind === "topup").reduce((s, r) => s + r.amount, 0))} />
        <Stat label="Failed" value={(rows ?? []).filter((r) => r.status !== "paid").length} color="#ef4444" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {(["all", "plan", "topup", "failed"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border cursor-pointer"
            style={{ background: kind === k ? "rgba(245,158,11,0.12)" : "transparent", borderColor: kind === k ? "rgba(245,158,11,0.4)" : "var(--color-bg4)", color: kind === k ? "#f59e0b" : "var(--color-text2)" }}>
            {{ all: "All", plan: "Plans", topup: "Top-ups", failed: "Failed" }[k]}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-bg4 bg-bg2 overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 700 }}>
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-text3 border-b border-bg4">{["Date", "Client", "What", "Amount", "Status"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={5} className="px-4 py-6 text-text3">Loading…</td></tr>}
            {rows && shown.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-text3">No payments.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-bg4 text-text2">
                <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-2.5"><Link href={`/admin/clients/${r.clientId}`} className="font-semibold text-text no-underline hover:underline">{r.client}</Link></td>
                <td className="px-4 py-2.5">
                  {r.kind === "topup" ? `Top-up · +${r.topUpUnits} ${r.topUpField ? FEATURE_LABEL[r.topUpField].unit : ""}` : `${r.planId ? PLANS[r.planId]?.name : "Plan"} plan${r.periodEnd ? ` · until ${fmtDate(r.periodEnd)}` : ""}`}
                  {r.fake && <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-bg4 text-text3">TEST</span>}
                </td>
                <td className="px-4 py-2.5 font-semibold text-text">{inr(r.amount)}</td>
                <td className="px-4 py-2.5" style={{ color: r.status === "paid" ? "#10b981" : "#ef4444" }} title={r.failureReason}>{r.status === "paid" ? "Paid" : "Failed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

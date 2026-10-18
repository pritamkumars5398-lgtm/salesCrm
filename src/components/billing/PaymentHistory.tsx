"use client";
import { PLANS, type PlanId } from "@/lib/plans";

export interface PaymentRow {
  _id: string;
  planId: PlanId;
  amount: number;
  status: "paid" | "failed";
  periodStart?: string;
  periodEnd?: string;
  creditedDays: number;
  failureReason?: string;
  createdAt: string;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function PaymentHistory({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) return null;
  return (
    <div className="mt-8">
      <p className="mb-3 text-[10.5px] font-bold uppercase tracking-widest text-text3">Payments</p>
      <div className="overflow-x-auto rounded-xl border border-bg4 bg-bg2">
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-text3">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Plan</th>
              <th className="px-4 py-2.5">Amount</th>
              <th className="px-4 py-2.5">Period</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p._id} className="border-t border-bg4 text-text2">
                <td className="px-4 py-2.5">{fmt(p.createdAt)}</td>
                <td className="px-4 py-2.5">{PLANS[p.planId]?.name ?? p.planId}</td>
                <td className="px-4 py-2.5">₹{p.amount.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2.5">
                  {p.status === "paid" ? `${fmt(p.periodStart)} → ${fmt(p.periodEnd)}` : "—"}
                  {p.creditedDays > 0 && <span className="ml-1 text-text3">(+{p.creditedDays} days carried over)</span>}
                </td>
                <td className="px-4 py-2.5">
                  {p.status === "paid"
                    ? <span className="font-semibold text-green-500">Paid</span>
                    : <span className="text-red-500" title={p.failureReason}>Failed</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

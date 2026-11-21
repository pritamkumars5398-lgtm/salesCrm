"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import { Card, PageHeader, PlanPill, Stat, StatusPill, inr, fmtDate, FEATURE_LABEL, TOPUP_FIELDS, type ClientStatus } from "./ui";
import type { PlanId } from "@/lib/plans";
import type { TopUpField } from "@/lib/topups";

interface Overview {
  month: string;
  clients: { total: number; active: number; expiring: number; expired: number; free: number };
  revenue: { thisMonth: number; thisMonthPlans: number; thisMonthTopUps: number; allTime: number };
  usage: Record<TopUpField, number>;
  workspaces: number;
  attention: { id: string; name: string; email: string; reasons: string[] }[];
  recentClients: { id: string; name: string; email: string; createdAt: string; plan: PlanId; status: ClientStatus }[];
}

export default function AdminOverview() {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/admin/overview").then(async (r) => (r.ok ? setD(await r.json()) : setErr((await r.json().catch(() => ({}))).error || "Couldn't load"))).catch(() => setErr("Couldn't load"));
  }, []);
  const monthName = d ? new Date(`${d.month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "";

  return (
    <>
      <PageHeader title="Overview" sub={d ? `All clients and platform usage · ${monthName}` : "Loading…"} />
      {err && <p className="text-[13px]" style={{ color: "#ef4444" }}>{err}</p>}
      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Clients" value={d.clients.total} sub={`${d.workspaces} workspaces`} />
            <Stat label="Paying now" value={d.clients.active + d.clients.expiring} color="#10b981" sub={d.clients.expiring ? `${d.clients.expiring} end within 5 days` : "none ending soon"} />
            <Stat label="Expired / Free" value={`${d.clients.expired} / ${d.clients.free}`} color={d.clients.expired ? "#ef4444" : undefined} sub="not paying" />
            <Stat label="Revenue this month" value={inr(d.revenue.thisMonth)} color="#f59e0b" sub={`Plans ${inr(d.revenue.thisMonthPlans)} · Top-ups ${inr(d.revenue.thisMonthTopUps)} · All time ${inr(d.revenue.allTime)}`} />
          </div>

          <Card title="Platform usage this month" sub="Everything all clients used, added up">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {TOPUP_FIELDS.map((f) => (
                <div key={f} className="rounded-xl bg-bg3 p-3">
                  <p className="text-[11.5px] text-text3 m-0">{FEATURE_LABEL[f].name}</p>
                  <p className="text-[20px] font-bold text-text m-0">{(d.usage[f] ?? 0).toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Needs attention" sub="Plans ending, limits nearly used, or nothing set up yet">
              {d.attention.length === 0 ? <p className="text-[13px] text-text3 m-0">All good — nothing needs you right now.</p> : (
                <div className="flex flex-col divide-y divide-bg4">
                  {d.attention.map((a) => (
                    <Link key={a.id} href={`/admin/clients/${a.id}`} className="flex items-start gap-2.5 py-2.5 no-underline">
                      <IconAlertTriangle size={15} style={{ color: "#f59e0b", marginTop: 2, flexShrink: 0 }} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-text m-0 truncate">{a.name} <span className="font-normal text-text3">· {a.email}</span></p>
                        <p className="text-[12px] text-text3 m-0">{a.reasons.join(" · ")}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Newest clients" action={<Link href="/admin/clients" className="text-[12.5px] font-semibold no-underline" style={{ color: "#f59e0b" }}>All clients →</Link>}>
              <div className="flex flex-col divide-y divide-bg4">
                {d.recentClients.map((c) => (
                  <Link key={c.id} href={`/admin/clients/${c.id}`} className="flex items-center gap-3 py-2.5 no-underline">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-text m-0 truncate">{c.name}</p>
                      <p className="text-[12px] text-text3 m-0 truncate">{c.email} · joined {fmtDate(c.createdAt)}</p>
                    </div>
                    <PlanPill plan={c.plan} />
                    <StatusPill status={c.status} />
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

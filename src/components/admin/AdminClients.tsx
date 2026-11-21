"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@tabler/icons-react";
import { PageHeader, PlanPill, StatusPill, UsageBar, fmtDate, LIMIT_KEY, type ClientStatus } from "./ui";
import type { PlanId } from "@/lib/plans";
import type { TopUpField } from "@/lib/topups";

export interface ClientRow {
  id: string;
  name: string;
  owner: { name: string; email: string };
  createdAt: string;
  plan: PlanId;
  purchasedPlan: PlanId;
  expiresAt: string | null;
  status: ClientStatus;
  limits: Record<string, number>;
  usage: Record<TopUpField, number>;
  credits: Record<TopUpField, number>;
  workspaces: { id: string; name: string; live: boolean; leads: number }[];
  members: number;
  channelsReady: string[];
  usesPlatformCredentials: boolean;
}

const FILTERS: { id: "all" | ClientStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expiring", label: "Ends soon" },
  { id: "expired", label: "Expired" },
  { id: "free", label: "Free" },
];

export default function AdminClients() {
  const router = useRouter();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  useEffect(() => { fetch("/api/admin/clients").then((r) => r.json()).then((d) => setRows(d.clients ?? [])).catch(() => setRows([])); }, []);

  const shown = useMemo(() => (rows ?? []).filter((c) =>
    (filter === "all" || c.status === filter) &&
    (!q || `${c.name} ${c.owner.email} ${c.owner.name}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, filter]);

  return (
    <>
      <PageHeader title="Clients" sub={rows ? `${rows.length} organizations` : "Loading…"} />
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[340px]">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input className="form-input text-[13px] w-full" style={{ paddingLeft: 32 }} placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border cursor-pointer"
            style={{ background: filter === f.id ? "rgba(245,158,11,0.12)" : "transparent", borderColor: filter === f.id ? "rgba(245,158,11,0.4)" : "var(--color-bg4)", color: filter === f.id ? "#f59e0b" : "var(--color-text2)" }}>
            {f.label}{rows ? ` ${f.id === "all" ? rows.length : rows.filter((c) => c.status === f.id).length}` : ""}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-bg4 bg-bg2 overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 980 }}>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text3 border-b border-bg4">
              {["Client", "Plan", "Status", "Ends", "AI calls", "WhatsApp", "Leads", "Setup", "Workspaces"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={9} className="px-4 py-6 text-text3">Loading…</td></tr>}
            {rows && shown.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-text3">No clients match.</td></tr>}
            {shown.map((c) => (
              <tr key={c.id} onClick={() => router.push(`/admin/clients/${c.id}`)} className="border-b border-bg4 cursor-pointer hover:bg-bg3">
                <td className="px-4 py-3">
                  <p className="font-semibold text-text m-0">{c.name}</p>
                  <p className="text-[12px] text-text3 m-0">{c.owner.email}</p>
                </td>
                <td className="px-4 py-3"><PlanPill plan={c.purchasedPlan} /></td>
                <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                <td className="px-4 py-3 text-text2 whitespace-nowrap">{c.purchasedPlan === "free" ? "—" : c.expiresAt ? fmtDate(c.expiresAt) : "No end"}</td>
                <td className="px-4 py-3"><UsageBar used={c.usage.callsMade} limit={c.limits[LIMIT_KEY.callsMade]} extra={c.credits.callsMade} /></td>
                <td className="px-4 py-3"><UsageBar used={c.usage.messagesSent} limit={c.limits[LIMIT_KEY.messagesSent]} extra={c.credits.messagesSent} /></td>
                <td className="px-4 py-3"><UsageBar used={c.usage.leadsScraped} limit={c.limits[LIMIT_KEY.leadsScraped]} extra={c.credits.leadsScraped} /></td>
                <td className="px-4 py-3">
                  <span className="text-[12px] font-semibold" style={{ color: c.channelsReady.length ? "#10b981" : "#f59e0b" }}>
                    {c.channelsReady.length ? `${c.channelsReady.length} of 7 set up` : "Not set up"}
                  </span>
                  {c.usesPlatformCredentials && <p className="text-[11px] text-text3 m-0">uses platform keys</p>}
                </td>
                <td className="px-4 py-3 text-text2">{c.workspaces.length} · {c.members} people</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

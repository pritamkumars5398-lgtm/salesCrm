"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { IconLoader2 } from "@tabler/icons-react";

interface RunSummary {
  _id: string;
  trigger: "schedule" | "manual";
  status: "running" | "done" | "failed";
  detail: string;
  startedAt: string;
  finishedAt?: string;
  campaign: { _id: string; status: string; total: number; sent: number; failed: number; skipped: number } | null;
}

interface RunLead {
  _id: string;
  name: string;
  company: string;
  contact: string;
  state: "queued" | "working" | "contacted" | "failed" | "skipped";
  what: string;
  channel: string | null;
  at: string | null;
  error: string;
}

const STATE_STYLE: Record<RunLead["state"], { label: string; color: string }> = {
  working: { label: "Working on it", color: "#6366f1" },
  queued: { label: "Queued", color: "#94a3b8" },
  contacted: { label: "Contacted", color: "#10b981" },
  failed: { label: "Failed", color: "#ef4444" },
  skipped: { label: "Skipped", color: "#f59e0b" },
};

const CHANNEL_LABEL: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS", call: "Call", system: "" };

const isLive = (r: RunSummary) => r.status === "running" || r.campaign?.status === "pending" || r.campaign?.status === "running";

function RunLeads({ jobId, run }: { jobId: string; run: RunSummary }) {
  const live = isLive(run);
  const { data, isLoading } = useQuery({
    queryKey: ["cron-run", run._id],
    queryFn: () => fetch(`/api/crons/${jobId}/runs/${run._id}`).then((r) => r.json()) as Promise<{ leads: RunLead[] }>,
    refetchInterval: live ? 3000 : false,
  });
  if (!run.campaign) return null;
  if (isLoading) return <p className="px-3 py-2 text-[12px] text-text3">Loading leads…</p>;
  const leads = data?.leads ?? [];
  if (leads.length === 0) return <p className="px-3 py-2 text-[12px] text-text3">No leads in this run.</p>;
  return (
    <div className="mt-2 max-h-[360px] overflow-auto rounded-lg border border-bg4">
      <table className="w-full min-w-[620px] text-left text-[12px]">
        <thead className="sticky top-0 bg-bg3 text-[10.5px] uppercase tracking-wider text-text3">
          <tr>
            <th className="px-3 py-2">Lead</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">What happened</th>
            <th className="px-3 py-2">When</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const st = STATE_STYLE[l.state];
            return (
              <tr key={l._id} className="border-t border-bg4 align-top text-text2">
                <td className="px-3 py-2">
                  <p className="font-semibold text-text">{l.name || "—"}</p>
                  <p className="text-[11px] text-text3">{[l.company !== l.name ? l.company : "", l.contact].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: st.color }}>
                    {l.state === "working" ? <IconLoader2 size={12} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />}
                    {st.label}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {l.channel && CHANNEL_LABEL[l.channel] ? <span className="mr-1 rounded bg-bg3 px-1.5 py-0.5 text-[10.5px] font-semibold">{CHANNEL_LABEL[l.channel]}</span> : null}
                  {l.what}
                  {l.error && <p className="mt-0.5 text-[11px] text-red-500">{l.error}</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-text3">
                  {l.at ? new Date(l.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Opened from a schedule card: its recent runs and, for outreach runs, every lead and what happened. */
export default function CronRunsPanel({ jobId }: { jobId: string }) {
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["cron-runs", jobId],
    queryFn: () => fetch(`/api/crons/${jobId}/runs`).then((r) => r.json()) as Promise<RunSummary[]>,
    refetchInterval: (q) => ((q.state.data as RunSummary[] | undefined)?.some(isLive) ? 3000 : 15000),
  });

  if (isLoading) return <p className="px-4 pb-4 text-[12px] text-text3">Loading runs…</p>;
  if (runs.length === 0) {
    return <p className="px-4 pb-4 text-[12px] text-text3">No runs yet. Runs appear here — with every lead they contacted — as soon as the schedule fires or you press Run.</p>;
  }
  const selected = runs.find((r) => r._id === openRunId) ?? runs[0];

  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-text3">Recent runs</p>
      {runs.map((r) => {
        const live = isLive(r);
        const c = r.campaign;
        const done = c ? c.sent + c.failed + c.skipped : 0;
        const pct = c && c.total ? Math.round((done / c.total) * 100) : 0;
        const active = r._id === selected._id;
        return (
          <div key={r._id} className="rounded-xl border p-3" style={{ borderColor: active ? "var(--color-primary-light)" : "var(--color-bg4)", background: "var(--color-bg)" }}>
            <button onClick={() => setOpenRunId(r._id)} className="flex w-full flex-wrap items-center gap-2 text-left">
              <span className="text-[12px] font-semibold text-text">
                {new Date(r.startedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className="text-[11px] text-text3">· {r.trigger === "manual" ? "Run by hand" : "Scheduled"} · {formatDistanceToNow(new Date(r.startedAt), { addSuffix: true })}</span>
              <span className="ml-auto text-[11px] font-bold" style={{ color: live ? "#6366f1" : r.status === "failed" ? "#ef4444" : "#10b981" }}>
                {live ? "In progress" : r.status === "failed" ? "Failed" : "Done"}
              </span>
            </button>
            {r.detail && <p className="mt-1 text-[12px] text-text2">{r.detail}</p>}
            {c && (
              <div className="mt-2">
                <div className="flex justify-between text-[11px] text-text3">
                  <span>{c.sent} contacted · {c.failed} failed · {c.skipped} skipped · {Math.max(0, c.total - done)} queued</span>
                  <span>{done}/{c.total}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg4">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#10b981" }} />
                </div>
              </div>
            )}
            {active && <RunLeads jobId={jobId} run={r} />}
          </div>
        );
      })}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { PLANS, type PlanId } from "@/lib/plans";
import type { TopUpField } from "@/lib/topups";
import CustomerSetupPanel from "@/components/settings/CustomerSetupPanel";
import { Card, PageHeader, PlanPill, Stat, StatusPill, UsageBar, fmtDate, inr, FEATURE_LABEL, TOPUP_FIELDS, LIMIT_KEY } from "./ui";
import { SMS_COMING_SOON } from "@/lib/constants/coming-soon";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClientRow } from "./AdminClients";

interface ClientDetail extends Omit<ClientRow, "workspaces"> {
  customLimits: Record<string, number>;
  planLimits: Record<string, number>;
  workspaces: { id: string; name: string; live: boolean; leads: number; setup: Record<string, boolean> }[];
  team: { name: string; email: string; role: string; allWorkspaces: boolean }[];
  payments: { id: string; kind: string; planId?: PlanId; topUpField?: TopUpField; topUpUnits?: number; amount: number; status: string; createdAt: string; periodEnd?: string }[];
  history: ({ month: string } & Record<TopUpField, number>)[];
}

type Tab = "overview" | "plan" | "workspaces" | "payments" | "team";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan & limits" },
  { id: "workspaces", label: "Workspaces & keys" },
  { id: "payments", label: "Payments" },
  { id: "team", label: "Team" },
];

const CHANNEL_LABEL: Record<string, string> = { ai: "AI brain", calls: "Phone line", voice: "AI voice", whatsapp: "WhatsApp", email: "Email", ...(SMS_COMING_SOON ? {} : { sms: "SMS" }), leads: "Lead sources" };

type LimitChoice = "plan" | "off" | "unlimited" | "custom";
function choiceOf(v: number | undefined): LimitChoice {
  if (v === undefined) return "plan";
  if (v === 0) return "off";
  if (v === -1) return "unlimited";
  return "custom";
}

export default function AdminClient({ id }: { id: string }) {
  const showToast = useAppStore((s) => s.showToast);
  const [c, setC] = useState<ClientDetail | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState("");
  // subscription
  const [plan, setPlan] = useState<PlanId>("free");
  const [expiry, setExpiry] = useState("");
  // limits / feature switches
  const [limits, setLimits] = useState<Record<string, { choice: LimitChoice; value: string }>>({});
  const [grant, setGrant] = useState<Record<string, string>>({});
  const [wsId, setWsId] = useState("");
  // Height of the sticky header, so the workspace list sticks just below it.
  const headRef = useRef<HTMLDivElement | null>(null);
  const [headH, setHeadH] = useState(0);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const search = useSearchParams();
  const router = useRouter();
  const setTab = (t: Tab) => router.replace(`/admin/clients/${id}?tab=${t}`, { scroll: false });

  const apply = useCallback((d: ClientDetail) => {
    setC(d);
    setPlan(d.purchasedPlan);
    setExpiry(d.expiresAt ? d.expiresAt.slice(0, 10) : "");
    const l: Record<string, { choice: LimitChoice; value: string }> = {};
    for (const key of [...Object.values(LIMIT_KEY), "workspaces"]) {
      const v = d.customLimits[key];
      l[key] = { choice: choiceOf(v), value: v !== undefined && v > 0 ? String(v) : "" };
    }
    setLimits(l);
    setGrant({});
  }, []);

  const load = useCallback(() => {
    fetch(`/api/admin/clients/${id}`)
      .then(async (r) => (r.ok ? apply(await r.json()) : setErr((await r.json().catch(() => ({}))).error || "Couldn't load")))
      .catch(() => setErr("Couldn't load"));
  }, [id, apply]);
  useEffect(() => { load(); }, [load]);

  async function patch(body: Record<string, unknown>, what: string) {
    setSaving(what);
    try {
      const r = await fetch(`/api/admin/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't save");
      apply(d);
      showToast(`${what} saved`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setSaving("");
    }
  }

  if (err) return <p className="text-[13px]" style={{ color: "#ef4444" }}>{err}</p>;
  if (!c) return <p className="text-[13px] text-text3">Loading…</p>;

  const limitRows: { key: string; label: string; field?: TopUpField }[] = [
    ...TOPUP_FIELDS.map((f) => ({ key: LIMIT_KEY[f], label: FEATURE_LABEL[f].name, field: f })),
    { key: "workspaces", label: "Workspaces (business lines)" },
  ];

  function saveLimits() {
    const out: Record<string, number | null> = {};
    for (const { key } of limitRows) {
      const l = limits[key];
      if (!l) continue;
      if (l.choice === "plan") out[key] = null;
      else if (l.choice === "off") out[key] = 0;
      else if (l.choice === "unlimited") out[key] = -1;
      else {
        const n = parseInt(l.value, 10);
        if (!Number.isInteger(n) || n < 1) { showToast(`Enter a number for ${key}`, "error"); return; }
        out[key] = n;
      }
    }
    patch({ limits: out }, "Limits & features");
  }

  const tab = (search.get("tab") as Tab) || "overview";
  const ws = c.workspaces.find((w) => w.id === wsId) ?? c.workspaces[0];

  return (
    <>
      {/* Header + tabs stay at the top while the page scrolls */}
      <div ref={headRef} className="sticky top-0 z-20 -mt-6 pt-6 flex flex-col gap-4" style={{ background: "var(--color-bg)" }}>
      <PageHeader
        back={{ href: "/admin/clients", label: "All clients" }}
        title={c.name}
        sub={<span className="flex items-center gap-2 flex-wrap">{c.owner.name} · {c.owner.email} · joined {fmtDate(c.createdAt)} <PlanPill plan={c.purchasedPlan} /> <StatusPill status={c.status} /></span>}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bg4 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className="shrink-0 px-4 py-2.5 text-[13px] font-semibold bg-transparent border-none cursor-pointer"
            style={{ color: tab === t.id ? "#f59e0b" : "var(--color-text3)", borderBottom: `2px solid ${tab === t.id ? "#f59e0b" : "transparent"}`, marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Plan" value={PLANS[c.purchasedPlan].name} sub={c.purchasedPlan === "free" ? "Free forever" : c.expiresAt ? `Ends ${fmtDate(c.expiresAt)}` : "No end date"} />
            <Stat label="Paid so far" value={inr(c.payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0))} color="#f59e0b" sub={`${c.payments.filter((p) => p.status === "paid").length} payments`} />
            <Stat label="Workspaces" value={c.workspaces.length} sub={`${c.workspaces.reduce((s, w) => s + w.leads, 0).toLocaleString("en-IN")} leads · ${c.team.length} people`} />
            <Stat label="Channels ready" value={`${c.channelsReady.length} / 7`} color={c.channelsReady.length === 7 ? "#10b981" : "#f59e0b"} sub={c.usesPlatformCredentials ? "may use platform keys" : "own keys only"} />
          </div>
          <Card title="This month" sub="Used against their plan limit (+ extra credits)">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {TOPUP_FIELDS.map((f) => (
                <div key={f} className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-text2">{FEATURE_LABEL[f].name}</span>
                  <UsageBar used={c.usage[f]} limit={c.limits[LIMIT_KEY[f]]} extra={c.credits[f]} />
                </div>
              ))}
            </div>
          </Card>
          <Card title="Usage by month" sub="Last 6 months, all workspaces">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[11px] uppercase text-text3 border-b border-bg4"><th className="py-2 pr-2">Month</th>{TOPUP_FIELDS.map((f) => <th key={f} className="py-2 px-2">{FEATURE_LABEL[f].unit}</th>)}</tr></thead>
              <tbody>
                {c.history.map((h) => (
                  <tr key={h.month} className="border-b border-bg4 text-text2"><td className="py-2 pr-2 font-semibold text-text">{h.month}</td>{TOPUP_FIELDS.map((f) => <td key={f} className="py-2 px-2">{(h[f] ?? 0).toLocaleString("en-IN")}</td>)}</tr>
                ))}
                {c.history.length === 0 && <tr><td colSpan={6} className="py-3 text-text3">No usage yet.</td></tr>}
              </tbody>
            </table>
          </div>
          </Card>

        </>
      )}

      {tab === "plan" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subscription */}
        <Card title="Subscription" sub="Set the plan and when it ends. Changes apply straight away.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-text2">Plan</span>
              <select className="form-input text-[13px]" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
                {(Object.keys(PLANS) as PlanId[]).map((p) => <option key={p} value={p}>{PLANS[p].name}{PLANS[p].priceINR ? ` · ${inr(PLANS[p].priceINR)}/mo` : ""}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-text2">Ends on</span>
              <input type="date" className="form-input text-[13px]" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={plan === "free"} />
            </label>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {plan !== "free" && (
              <>
                <button type="button" className="px-2.5 py-1 rounded-md text-[12px] font-semibold bg-bg3 border border-bg4 text-text2 cursor-pointer" onClick={() => {
                  const base = expiry && new Date(expiry) > new Date() ? new Date(expiry) : new Date();
                  base.setDate(base.getDate() + 30);
                  setExpiry(base.toISOString().slice(0, 10));
                }}>+30 days</button>
                <button type="button" className="px-2.5 py-1 rounded-md text-[12px] font-semibold bg-bg3 border border-bg4 text-text2 cursor-pointer" onClick={() => setExpiry("")}>No end date</button>
              </>
            )}
            <button type="button" disabled={!!saving} onClick={() => patch({ plan, planExpiresAt: plan === "free" || !expiry ? null : new Date(`${expiry}T23:59:59`).toISOString() }, "Subscription")}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold text-white border-none cursor-pointer disabled:opacity-50" style={{ background: "#f59e0b" }}>
              <IconCheck size={14} /> {saving === "Subscription" ? "Saving…" : "Save"}
            </button>
          </div>
          {c.status === "expired" && <p className="text-[12px] m-0" style={{ color: "#ef4444" }}>Their paid plan ended on {fmtDate(c.expiresAt)} — they are on Free limits until it's renewed.</p>}
        </Card>

        {/* Platform keys */}
        <Card title="Keys & billing source" sub="Whose API accounts this client's calls and messages run on">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={c.usesPlatformCredentials} disabled={!!saving}
              onChange={(e) => patch({ usesPlatformCredentials: e.target.checked }, "Keys setting")} />
            <span className="text-[13px] text-text2">
              <strong className="text-text">May use the platform&rsquo;s own keys</strong> (from the server&rsquo;s .env) for anything not set up below.
              <br /><span className="text-text3 text-[12px]">Off = only the keys you add for this client are used, so they never spend on your accounts.</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(CHANNEL_LABEL).map((ch) => {
              const ready = c.channelsReady.includes(ch);
              return <span key={ch} className="px-2 py-0.5 rounded-full text-[11.5px] font-semibold" style={{ background: ready ? "rgba(16,185,129,0.12)" : "var(--color-bg3)", color: ready ? "#10b981" : "var(--color-text3)" }}>{ready ? "✓" : "○"} {CHANNEL_LABEL[ch]}</span>;
            })}
          </div>
        </Card>
          </div>
      {/* Usage, limits, feature switches, credits */}
      <Card title="Usage, limits & permissions" sub="This month's usage. Switch a feature off, change its monthly limit, or give free extra credits."
        action={<button type="button" disabled={!!saving} onClick={saveLimits} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold text-white border-none cursor-pointer disabled:opacity-50" style={{ background: "#f59e0b" }}><IconCheck size={14} /> {saving === "Limits & features" ? "Saving…" : "Save limits"}</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ minWidth: 760 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text3 border-b border-bg4">
                {["Feature", "Used this month", "Plan gives", "Allowed", "Extra credits"].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {limitRows.map(({ key, label, field }) => {
                const l = limits[key] ?? { choice: "plan" as LimitChoice, value: "" };
                const planGives = c.planLimits[key];
                return (
                  <tr key={key} className="border-b border-bg4">
                    <td className="px-2 py-2.5 font-semibold text-text">{label}</td>
                    <td className="px-2 py-2.5">{field ? <UsageBar used={c.usage[field]} limit={c.limits[key]} extra={c.credits[field]} /> : <span className="text-text2">{c.workspaces.length} in use</span>}</td>
                    <td className="px-2 py-2.5 text-text3">{planGives === -1 ? "Unlimited" : planGives?.toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <select className="form-input text-[12.5px] py-1" style={{ width: "auto" }} value={l.choice} onChange={(e) => setLimits((p) => ({ ...p, [key]: { ...l, choice: e.target.value as LimitChoice } }))}>
                          <option value="plan">Plan default</option>
                          <option value="custom">Custom</option>
                          <option value="unlimited">Unlimited</option>
                          <option value="off">Off (blocked)</option>
                        </select>
                        {l.choice === "custom" && (
                          <input type="number" min={1} className="form-input text-[12.5px] py-1" style={{ width: 90 }} value={l.value} onChange={(e) => setLimits((p) => ({ ...p, [key]: { ...l, value: e.target.value } }))} />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      {field ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-text2 w-12">{c.credits[field].toLocaleString("en-IN")}</span>
                          <input type="number" placeholder="+0" className="form-input text-[12.5px] py-1" style={{ width: 80 }} value={grant[field] ?? ""} onChange={(e) => setGrant((p) => ({ ...p, [field]: e.target.value }))} />
                          <button type="button" title="Add these free credits (use a minus number to take away)" disabled={!grant[field] || !!saving}
                            onClick={() => patch({ grantCredits: { [field]: parseInt(grant[field], 10) } }, "Credits")}
                            className="p-1.5 rounded-md bg-bg3 border border-bg4 text-text2 cursor-pointer disabled:opacity-40"><IconPlus size={13} /></button>
                        </div>
                      ) : <span className="text-text3">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-text3 m-0">&ldquo;Off&rdquo; blocks the feature completely for this client, even with extra credits. Custom limits apply only while their plan is active.</p>
      </Card>

        </>
      )}

      {tab === "workspaces" && (
        <>
          {c.workspaces.length === 0 ? <p className="text-[13px] text-text3">No workspaces yet.</p> : (
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
              {/* Pick a workspace — stays in place while the keys on the right scroll */}
              <div className="flex flex-col gap-2 lg:sticky lg:overflow-y-auto lg:pr-1 lg:top-[var(--ws-top)] lg:max-h-[var(--ws-max)]" style={{ "--ws-top": `${headH + 16}px`, "--ws-max": `calc(100vh - ${headH + 40}px)` } as React.CSSProperties}>
                <span className="text-[12px] font-semibold text-text3 uppercase tracking-wide">Workspaces</span>
                {c.workspaces.map((w) => {
                  const on = ws?.id === w.id;
                  const ready = Object.values(w.setup).filter(Boolean).length;
                  return (
                    <button key={w.id} type="button" onClick={() => setWsId(w.id)}
                      className="text-left rounded-xl border p-3 cursor-pointer"
                      style={{ background: on ? "rgba(245,158,11,0.08)" : "var(--color-bg2)", borderColor: on ? "rgba(245,158,11,0.45)" : "var(--color-bg4)" }}>
                      <p className="text-[13px] font-semibold text-text m-0 truncate">{w.name}</p>
                      <p className="text-[11.5px] text-text3 m-0">{w.live ? "Published" : "Draft"} · {w.leads.toLocaleString("en-IN")} leads</p>
                      <p className="text-[11.5px] m-0 mt-1 font-semibold" style={{ color: ready === 7 ? "#10b981" : "#f59e0b" }}>{ready} of 7 channels set up</p>
                    </button>
                  );
                })}
              </div>
              {/* Its keys + health */}
              {ws && (
                <Card title={ws.name} sub="Click any card below to set up or update its keys and check whether they work.">
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(CHANNEL_LABEL).map((ch) => (
                      <span key={ch} className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: ws.setup[ch] ? "rgba(16,185,129,0.12)" : "var(--color-bg3)", color: ws.setup[ch] ? "#10b981" : "var(--color-text3)" }}>{ws.setup[ch] ? "✓" : "○"} {CHANNEL_LABEL[ch]}</span>
                    ))}
                  </div>
                  <CustomerSetupPanel
                    embedded
                    fixedCustomerId={c.id}
                    initialAgentId={ws.id}
                    customers={[{ id: c.id, name: c.name, email: c.owner.email, agents: c.workspaces.map((w) => ({ id: w.id, name: w.name })) }]}
                  />
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {tab === "payments" && (
      <Card title="Payments" sub="Plans and top-ups this client paid for">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] uppercase text-text3 border-b border-bg4">{["Date", "What", "Amount", "Status"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
            <tbody>
              {c.payments.map((p) => (
                <tr key={p.id} className="border-b border-bg4 text-text2">
                  <td className="py-2 pr-3">{fmtDate(p.createdAt)}</td>
                  <td className="py-2 pr-3">{p.kind === "topup" ? `Top-up · +${p.topUpUnits} ${p.topUpField ? FEATURE_LABEL[p.topUpField].unit : ""}` : `${p.planId ? PLANS[p.planId]?.name : "Plan"} · until ${fmtDate(p.periodEnd)}`}</td>
                  <td className="py-2 pr-3 font-semibold text-text">{inr(p.amount)}</td>
                  <td className="py-2 pr-3" style={{ color: p.status === "paid" ? "#10b981" : "#ef4444" }}>{p.status === "paid" ? "Paid" : "Failed"}</td>
                </tr>
              ))}
              {c.payments.length === 0 && <tr><td colSpan={4} className="py-3 text-text3">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      )}

      {tab === "team" && (
        <Card title="Team" sub={`${c.team.length} people`}>
          <div className="flex flex-col divide-y divide-bg4">
            {c.team.map((m) => (
              <div key={m.email} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0"><p className="text-[13px] font-semibold text-text m-0 truncate">{m.name || m.email}</p><p className="text-[12px] text-text3 m-0 truncate">{m.email}</p></div>
                <span className="text-[11.5px] font-semibold capitalize text-text2 shrink-0">{m.role}{m.role === "member" && !m.allWorkspaces ? " · some workspaces" : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

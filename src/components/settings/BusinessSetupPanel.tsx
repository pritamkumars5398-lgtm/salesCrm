"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCircleCheckFilled, IconCircleDashed, IconChevronDown, IconChevronUp, IconX, IconCheck } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { useRouter } from "next/navigation";
import { IconBuildingStore, IconPlus } from "@tabler/icons-react";
import CreateWorkspaceModal from "@/components/workspace/CreateWorkspaceModal";

/**
 * The customer's one "Your business" page: what they sell, who to reach and how
 * the AI should talk — in three short cards, with rarely-used fields folded away.
 * Same settings keys as the old Business Profile + AI Sales Playbook pages.
 */

type Field = { key: string; label: string; hint?: string; placeholder?: string; type?: "textarea" | "select"; options?: string[] };

const ABOUT: Field[] = [
  { key: "brandName", label: "Business name", placeholder: "e.g. Difmo", hint: "How the AI introduces your company" },
  { key: "businessWebsite", label: "Website", placeholder: "https://yourwebsite.com" },
  { key: "businessPhone", label: "Phone", placeholder: "+91 98765 43210" },
  { key: "offerType", label: "What you sell", type: "select", options: ["Services", "Software product", "Physical product", "Other"] },
  { key: "offerSummary", label: "What you offer, in one or two lines", type: "textarea", placeholder: "e.g. Hotel software for bookings, room status and billing in one place.", hint: "The AI only ever pitches what is written here" },
];

const AUDIENCE: Field[] = [
  { key: "industry", label: "Industry of your leads", placeholder: "e.g. Hotels, Dentists, Real estate", hint: "Used to find new leads" },
  { key: "targetCompanySize", label: "Company size", type: "select", options: ["Any", "1–10 (Micro)", "11–50 (Small)", "51–200 (Mid-market)", "201–1000 (Growth)", "1000+ (Enterprise)"] },
  { key: "targetCustomer", label: "Your ideal customer", placeholder: "e.g. Owners of 10–100 room hotels" },
];

const AI_TALK: Field[] = [
  { key: "aiPersonaName", label: "AI agent's name", placeholder: "e.g. Priya", hint: "Used on calls and in messages" },
  { key: "callGoal", label: "Goal of every conversation", placeholder: "e.g. Book a 20-minute demo" },
  { key: "businessServices", label: "Your products or services in detail", type: "textarea", placeholder: "List what you offer, key features and benefits…", hint: "The AI picks the 2–3 points that matter most to each lead" },
];

const MORE: Field[] = [
  { key: "pricingInfo", label: "Prices the AI may share", type: "textarea", placeholder: "Leave empty and the AI never quotes a price" },
  { key: "objectionHandling", label: "Common objections and your answers", type: "textarea", placeholder: "\"Too expensive\" → …" },
  { key: "customPrompt", label: "Extra rules for the AI", type: "textarea", placeholder: "e.g. Never promise delivery dates." },
  { key: "docLink", label: "Brochure link", placeholder: "https://yourwebsite.com/brochure.pdf", hint: "Shared with leads who ask for details" },
  { key: "followUpDays", label: "Follow-ups when a lead doesn't reply", type: "select", options: ["Disabled", "1", "2", "3", "4", "5", "6", "7"], hint: "Number of daily follow-ups" },
];

const ALERTS: Field[] = [
  { key: "ownerInterestAlerts", label: "Email me when a lead is interested", type: "select", options: ["On", "Off"], hint: "When a lead shows interest on a call, on WhatsApp or by email — at most one email per lead a day" },
  { key: "ownerAlertEmail", label: "Send alerts to", placeholder: "you@yourbusiness.com", hint: "Leave empty to use the account owner's login email. Separate several with commas." },
];

const ALL_KEYS = [...ABOUT, ...AUDIENCE, ...AI_TALK, ...MORE, ...ALERTS].map((f) => f.key).concat(["leadLocations", "leadLocation"]);

type Location = { name: string; active: boolean };

function parseLocations(v: Record<string, string>): Location[] {
  try {
    const list = JSON.parse(v.leadLocations || "[]");
    if (Array.isArray(list) && list.length) return list.filter((l) => l?.name).map((l) => ({ name: String(l.name), active: l.active !== false }));
  } catch { /* fall through */ }
  return v.leadLocation ? [{ name: v.leadLocation, active: true }] : [];
}

// Outside the panel: a component defined inside it would remount on every key press and drop input focus.
const Card = ({ step, title, sub, children }: { step: number; title: string; sub: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-bg4 bg-bg2 p-5 flex flex-col gap-4">
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0" style={{ background: "rgba(223,42,42,0.1)", color: "#df2a2a" }}>{step}</span>
      <div>
        <h3 className="text-[15px] font-bold text-text m-0">{title}</h3>
        <p className="text-[12.5px] text-text3 m-0 mt-0.5">{sub}</p>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  </section>
);


export default function BusinessSetupPanel({ readOnly, onOpenTab }: { readOnly?: boolean; onOpenTab: (tab: string) => void }) {
  const { activeAgent, agents, setActiveAgent, showToast } = useAppStore();
  const router = useRouter();
  const agentId = activeAgent?._id;
  const others = agents.filter((a) => a._id !== agentId);
  const [creating, setCreating] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [newLocation, setNewLocation] = useState("");
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoaded(false);
    const [s, k] = await Promise.all([
      fetch(`/api/settings?agentId=${agentId}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/knowledge?agentId=${agentId}`).then((r) => r.json()).catch(() => []),
    ]);
    const picked: Record<string, string> = {};
    for (const key of ALL_KEYS) picked[key] = s?.[key] ?? "";
    picked.leadLocations = JSON.stringify(parseLocations(picked));
    setSaved(picked);
    setValues(picked);
    setKnowledgeCount(Array.isArray(k) ? k.length : 0);
    setLoaded(true);
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const locations = useMemo(() => parseLocations(values), [values]);
  const dirtyKeys = ALL_KEYS.filter((k) => (values[k] ?? "") !== (saved[k] ?? ""));
  const set = (key: string, v: string) => setValues((p) => ({ ...p, [key]: v }));
  const setLocations = (list: Location[]) =>
    setValues((p) => ({ ...p, leadLocations: JSON.stringify(list), leadLocation: list.find((l) => l.active)?.name || list[0]?.name || "" }));

  const checklist = [
    { label: "Business name", done: !!values.brandName?.trim() },
    { label: "What you offer", done: !!values.offerSummary?.trim() },
    { label: "Industry of your leads", done: !!values.industry?.trim() },
    { label: "Where your leads are", done: locations.some((l) => l.active) },
    { label: "Goal of every conversation", done: !!values.callGoal?.trim() },
    { label: "Knowledge base (1+ document)", done: (knowledgeCount ?? 0) > 0, tab: "knowledge" },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  async function save() {
    if (!agentId || !dirtyKeys.length) return;
    const badEmail = (values.ownerAlertEmail || "").split(/[,;\s]+/).filter(Boolean).find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (badEmail) {
      showToast(`"${badEmail}" isn't a valid email for alerts`, "error");
      return;
    }
    setSaving(true);
    try {
      const patch = Object.fromEntries(dirtyKeys.map((k) => [k, values[k] ?? ""]));
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, settings: patch }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save");
      setSaved(values);
      showToast("Saved — your AI uses this from now on");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  function switchWorkspace(id: string) {
    const next = agents.find((a) => a._id === id);
    if (!next || id === agentId) return;
    if (dirtyKeys.length && !window.confirm("You have unsaved changes for this business. Leave without saving?")) return;
    setActiveAgent(next);
    router.push(`/settings/${id}?tab=business`);
  }

  /** Fill the form with another workspace's business details — nothing is saved until Save. */
  async function copyFromWorkspace(id: string) {
    const src = agents.find((a) => a._id === id);
    setCopyFrom("");
    if (!src) return;
    try {
      const d: Record<string, string> = await fetch(`/api/settings?agentId=${id}`).then((r) => r.json());
      const picked: Record<string, string> = {};
      for (const key of ALL_KEYS) picked[key] = d?.[key] ?? "";
      picked.leadLocations = JSON.stringify(parseLocations(picked));
      setValues(picked);
      showToast(`Copied from "${src.name}" — change what's different, then Save`);
    } catch {
      showToast("Couldn't copy from that business", "error");
    }
  }

  if (!loaded) return <p className="text-[13px] text-text3">Loading…</p>;

  const renderField = (f: Field) => (
    <label key={f.key} className={`flex flex-col gap-1 ${f.type === "textarea" ? "md:col-span-2" : ""}`}>
      <span className="text-[12.5px] font-semibold text-text2">{f.label}</span>
      {f.type === "select" ? (
        <select className="form-input text-[13px]" disabled={readOnly} value={values[f.key] || f.options![0]} onChange={(e) => set(f.key, e.target.value)}>
          {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "textarea" ? (
        <textarea className="form-input text-[13px]" rows={3} disabled={readOnly} placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
      ) : (
        <input className="form-input text-[13px]" disabled={readOnly} placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
      )}
      {f.hint && <span className="text-[11.5px] text-text3">{f.hint}</span>}
    </label>
  );

  return (
    <div className="flex flex-col gap-5 w-full max-w-[900px] mx-auto pb-24">
      <div>
        <h2 className="text-[20px] font-bold text-text m-0">Your business</h2>
        <p className="text-[13px] text-text3 m-0 mt-1">Tell the AI about your business. It uses this in every call, email and message.</p>
      </div>

      {/* Which business (workspace) this page sets up */}
      <section className="rounded-2xl border p-4 flex flex-col gap-3" style={{ borderColor: "rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.06)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(99,102,241,0.15)", color: "#6366f1" }}>
              <IconBuildingStore size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] uppercase font-bold tracking-wide text-text3 block">You&rsquo;re setting up</span>
              {agents.length > 1 ? (
                <select className="form-input text-[14px] font-semibold py-1 mt-0.5 w-full sm:max-w-[320px]" value={agentId} onChange={(e) => switchWorkspace(e.target.value)}>
                  {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
              ) : (
                <strong className="text-[15px] text-text block truncate">{activeAgent?.name}</strong>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {others.length > 0 && !readOnly && (
              <select className="form-input text-[12.5px] py-1.5" value={copyFrom} title="Fill this page with another business's details" onChange={(e) => { setCopyFrom(e.target.value); if (e.target.value) copyFromWorkspace(e.target.value); }}>
                <option value="">Copy from another business…</option>
                {others.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            )}
            {activeAgent?.role !== "member" && (
              <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold bg-bg2 border border-bg4 text-text cursor-pointer">
                <IconPlus size={14} /> Add another business
              </button>
            )}
          </div>
        </div>
        <p className="text-[12px] text-text3 m-0">
          Each workspace is its own business — with its own name, places, AI behaviour, leads and inbox. Changes on this page apply only to <strong className="text-text2">{activeAgent?.name}</strong>.
        </p>
      </section>

      {/* Setup checklist */}
      <section className="rounded-2xl border border-bg4 bg-bg2 p-4">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="text-[13.5px] font-bold text-text">Setup {doneCount} of {checklist.length} done</span>
          <div className="flex-1 max-w-[220px] h-2 rounded-full bg-bg4 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(doneCount / checklist.length) * 100}%`, background: "#10b981" }} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
          {checklist.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => c.tab && onOpenTab(c.tab)}
              className="flex items-center gap-1.5 text-left text-[12.5px] bg-transparent border-none p-0"
              style={{ color: c.done ? "var(--color-text2)" : "var(--color-text3)", cursor: c.tab ? "pointer" : "default" }}
            >
              {c.done ? <IconCircleCheckFilled size={15} style={{ color: "#10b981" }} /> : <IconCircleDashed size={15} />}
              <span className={c.tab && !c.done ? "underline" : ""}>{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      <Card step={1} title="About you" sub="Who you are and what you sell">
        {ABOUT.map(renderField)}
      </Card>

      <Card step={2} title="Who to reach" sub="The kind of leads the AI looks for and talks to">
        {AUDIENCE.slice(0, 1).map(renderField)}
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold text-text2">Where your leads are</span>
          <div className="flex flex-wrap gap-1.5">
            {locations.map((l, i) => (
              <span
                key={l.name}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border cursor-pointer"
                style={{ borderColor: l.active ? "rgba(16,185,129,0.4)" : "var(--color-bg4)", background: l.active ? "rgba(16,185,129,0.1)" : "var(--color-bg3)", color: l.active ? "#10b981" : "var(--color-text3)" }}
                title={l.active ? "Click to pause this location" : "Click to use this location"}
                onClick={() => !readOnly && setLocations(locations.map((x, j) => (j === i ? { ...x, active: !x.active } : x)))}
              >
                {l.name}
                {!readOnly && (
                  <IconX size={12} onClick={(e) => { e.stopPropagation(); setLocations(locations.filter((_, j) => j !== i)); }} />
                )}
              </span>
            ))}
            {!locations.length && <span className="text-[12px] text-text3">No locations yet</span>}
          </div>
          {!readOnly && (
            <div className="flex gap-2 mt-1">
              <input
                className="form-input text-[13px] flex-1"
                placeholder="Add a city or country, e.g. Lucknow"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const name = newLocation.trim();
                  if (name && !locations.some((l) => l.name.toLowerCase() === name.toLowerCase())) setLocations([...locations, { name, active: true }]);
                  setNewLocation("");
                }}
              />
              <button
                type="button"
                className="px-3 rounded-lg text-[12.5px] font-semibold bg-bg3 border border-bg4 text-text cursor-pointer"
                onClick={() => {
                  const name = newLocation.trim();
                  if (name && !locations.some((l) => l.name.toLowerCase() === name.toLowerCase())) setLocations([...locations, { name, active: true }]);
                  setNewLocation("");
                }}
              >Add</button>
            </div>
          )}
          <span className="text-[11.5px] text-text3">Green = used when finding leads. Click a place to pause it.</span>
        </div>
        {AUDIENCE.slice(1).map(renderField)}
      </Card>

      <Card step={3} title="How the AI talks" sub="What the AI says and what it aims for">
        {AI_TALK.map(renderField)}
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-[12.5px] font-semibold text-text2 bg-transparent border-none p-0 cursor-pointer"
          >
            {showMore ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />} More options
            <span className="font-normal text-text3">— prices, objections, extra rules, brochure, follow-ups</span>
          </button>
        </div>
        {showMore && MORE.map(renderField)}
      </Card>

      <Card step={4} title="Alerts for you" sub="Get an email the moment a lead is interested">
        {ALERTS.map(renderField)}
      </Card>

      {!readOnly && (
        <div className="sticky bottom-0 -mx-2 px-2 py-3 flex items-center justify-end gap-3" style={{ background: "linear-gradient(to top, var(--color-bg) 70%, transparent)" }}>
          {dirtyKeys.length > 0 ? (
            <>
              <span className="text-[12.5px] text-text3">You have unsaved changes</span>
              <button type="button" onClick={() => setValues(saved)} className="px-3.5 py-2 rounded-lg text-[13px] font-semibold bg-bg3 border border-bg4 text-text2 cursor-pointer">Undo</button>
            </>
          ) : (
            <span className="flex items-center gap-1 text-[12.5px] text-text3"><IconCheck size={14} /> All saved</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirtyKeys.length}
            className="px-5 py-2 rounded-lg text-[13px] font-bold text-white border-none cursor-pointer disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#df2a2a,#f24444)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} />}
    </div>
  );
}

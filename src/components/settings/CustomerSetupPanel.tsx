"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconSettings } from "@tabler/icons-react";
import { ADMIN_SETUP_SECTIONS } from "@/lib/constants/admin-settings";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import { useAppStore } from "@/store/useAppStore";
import { GEMINI_VOICES } from "@/lib/constants/gemini-voices";

interface Customer {
  id: string;
  name: string;
  email: string;
  agents: { id: string; name: string }[];
}

const MASK = "••••••••";

/**
 * Superadmin only: pick a customer and one of their workspaces, then set up its
 * AI brain, channels and lead sources. Keys are saved on the server; the customer
 * only ever sees "Configured · Active" on their Channels page.
 */
export default function CustomerSetupPanel({ customers, fixedCustomerId, initialAgentId, embedded }: {
  customers: Customer[];
  /** open on this customer and hide the customer picker (the admin client page) */
  fixedCustomerId?: string;
  initialAgentId?: string;
  /** inside the admin client page: no heading, no pickers — the page chooses the workspace */
  embedded?: boolean;
}) {
  const showToast = useAppStore((s) => s.showToast);
  const withWorkspaces = useMemo(() => customers.filter((c) => c.agents.length > 0), [customers]);
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? "");
  const [agentId, setAgentId] = useState("");
  const [section, setSection] = useState(ADMIN_SETUP_SECTIONS[0].key);
  const [stored, setStored] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [healthKey, setHealthKey] = useState(0);

  const customer = withWorkspaces.find((c) => c.id === customerId);
  const current = ADMIN_SETUP_SECTIONS.find((s) => s.key === section)!;

  useEffect(() => {
    setAgentId(customer?.agents.find((a) => a.id === initialAgentId)?.id ?? customer?.agents[0]?.id ?? "");
  }, [initialAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAgentId(customer?.agents.find((a) => a.id === initialAgentId)?.id ?? customer?.agents[0]?.id ?? "");
    setApplyToAll(false);
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setStored({});
    setDraft({});
    if (!agentId) return;
    setLoading(true);
    fetch(`/api/settings?agentId=${agentId}`)
      .then((r) => r.json())
      .then((s) => setStored(s && typeof s === "object" && !s.error ? s : {}))
      .catch(() => showToast("Couldn't load this workspace's settings", "error"))
      .finally(() => setLoading(false));
  }, [agentId, showToast]);

  async function save() {
    const patch: Record<string, string> = {};
    for (const f of current.fields) {
      if (!(f.key in draft)) continue;
      if (f.type === "password" && !draft[f.key]) continue; // empty = keep the saved key
      patch[f.key] = draft[f.key];
    }
    if (!Object.keys(patch).length) {
      showToast("Nothing changed");
      return;
    }
    const targets = applyToAll && customer ? customer.agents.map((a) => a.id) : [agentId];
    setSaving(true);
    try {
      for (const id of targets) {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: id, settings: patch }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      }
      const fresh = await fetch(`/api/settings?agentId=${agentId}`).then((r) => r.json());
      setStored(fresh);
      setDraft({});
      setHealthKey((k) => k + 1);
      showToast(`${current.title} saved${targets.length > 1 ? ` for ${targets.length} workspaces` : ""}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const value = (key: string) => (key in draft ? draft[key] : stored[key] ?? "");

  return (
    <div className="flex flex-col gap-4">
      {!embedded && <div>
        <h3 className="text-[15px] font-bold text-text m-0 flex items-center gap-2"><IconSettings size={17} /> Set up a customer</h3>
        <p className="text-[12.5px] text-text3 m-0 mt-1">
          Pick a customer and workspace, then add their keys, providers and models. Customers never see these — only &ldquo;Configured · Active&rdquo; on their Channels page.
        </p>
      </div>}

      {!embedded && <div className="flex flex-wrap gap-3">
        {!fixedCustomerId && (
          <select className="form-input text-[13px] min-w-[240px]" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Choose a customer…</option>
            {withWorkspaces.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.email}</option>
            ))}
          </select>
        )}
        {customer && (
          <select className="form-input text-[13px] min-w-[200px]" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {customer.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>}

      {agentId && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {ADMIN_SETUP_SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => { setSection(s.key); setDraft({}); }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer border"
                style={{
                  background: section === s.key ? "rgba(223,42,42,0.1)" : "var(--color-bg3)",
                  color: section === s.key ? "#df2a2a" : "var(--color-text2)",
                  borderColor: section === s.key ? "rgba(223,42,42,0.3)" : "var(--color-bg4)",
                }}
              >
                {s.title}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-[13px] text-text3 m-0">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {current.fields.map((f) => {
                const saved = stored[f.key] ?? "";
                const isSecret = f.type === "password";
                return (
                  <div key={f.key} className={`flex flex-col gap-1 ${f.type === "textarea" || f.type === "voices" ? "md:col-span-2" : ""}`}>
                    <span className="text-[12px] font-semibold text-text2">{f.label}</span>
                    {f.type === "voices" ? (
                      <VoicesField
                        agentId={agentId}
                        provider={value("voiceProvider") || "Google Gemini"}
                        raw={value(f.key)}
                        reloadKey={stored.voiceApiKey ?? ""}
                        defaultId={value("voiceId")}
                        onDefault={(id) => setDraft((d) => ({ ...d, voiceId: id }))}
                        onChange={(json) => setDraft((d) => ({ ...d, [f.key]: json }))}
                      />
                    ) : f.options ? (
                      <select className="form-input text-[13px]" value={value(f.key) || f.options[0]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>
                        {f.options.map((o) => <option key={o} value={o}>{o === "true" ? "Yes" : o === "false" ? "No" : o}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea className="form-input text-[13px]" rows={4} placeholder={f.placeholder} value={value(f.key)} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                    ) : (
                      <input
                        className="form-input text-[13px]"
                        type={isSecret ? "password" : "text"}
                        autoComplete="off"
                        placeholder={isSecret ? (saved.startsWith(MASK) ? `Saved (${saved}) — type to replace` : "Not set") : f.placeholder}
                        value={isSecret ? draft[f.key] ?? "" : value(f.key)}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      />
                    )}
                    {f.hint && <span className="text-[11px] text-text3">{f.hint}</span>}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            {customer && customer.agents.length > 1 ? (
              <label className="flex items-center gap-2 text-[12.5px] text-text2 cursor-pointer">
                <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
                Save to all {customer.agents.length} of this customer&rsquo;s workspaces
              </label>
            ) : <span />}
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white cursor-pointer disabled:opacity-50 border-none"
              style={{ background: "linear-gradient(135deg,#df2a2a,#f24444)" }}
            >
              <IconCheck size={15} /> {saving ? "Saving…" : `Save ${current.title}`}
            </button>
          </div>

          <div className="pt-4 border-t border-bg4">
            <IntegrationsPanel
              key={`${agentId}-${healthKey}`}
              endpoint={`/api/integrations/status?agentId=${agentId}`}
              title="Is it working?"
              subtitle="Live check of this workspace's keys with each provider — balances and usage included."
            />
          </div>
        </>
      )}
    </div>
  );
}

function parseVoices(raw: string): { id: string; name: string }[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.filter((v) => v && v.id).map((v) => ({ id: String(v.id), name: String(v.name || v.id) })) : [];
  } catch {
    return [];
  }
}

interface AccountVoice { id: string; name: string; gender?: string; desc?: string; previewUrl?: string | null; freePlanOk?: boolean }

/**
 * Which voices the customer may switch between. Gemini: tick from its voice list.
 * ElevenLabs: tick from the voices in that workspace's ElevenLabs account, or add one by ID.
 */
function VoicesField({ agentId, provider, raw, onChange, reloadKey, defaultId, onDefault }: {
  agentId: string; provider: string; raw: string; onChange: (json: string) => void;
  /** changes when the saved API key changes, so the account's voices are fetched again */
  reloadKey?: string;
  /** the voice calls use (voiceId); ★ sets it */
  defaultId?: string;
  onDefault?: (id: string) => void;
}) {
  const list = parseVoices(raw);
  const chosen = new Set(list.map((v) => v.id));
  const isGemini = provider === "Google Gemini" || provider === "Gemini";
  const [account, setAccount] = useState<AccountVoice[] | null>(null);
  const [extraId, setExtraId] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [reloads, setReloads] = useState(0);
  useEffect(() => {
    if (isGemini) return;
    setAccount(null);
    fetch(`/api/superadmin/voices?agentId=${agentId}&r=${reloads}`)
      .then((r) => r.json())
      .then((d) => setAccount(d.voices ?? []))
      .catch(() => setAccount([]));
  }, [agentId, isGemini, reloadKey, reloads]);

  const all: AccountVoice[] = isGemini
    ? GEMINI_VOICES.map((v) => ({ id: v.id, name: v.name, gender: v.gender, desc: v.desc, freePlanOk: true }))
    : account ?? [];
  const shortName = (n: string) => n.split(/\s+-\s+/)[0].trim();
  const toggle = (v: AccountVoice, on: boolean) =>
    onChange(JSON.stringify(on ? [...list, { id: v.id, name: shortName(v.name) }] : list.filter((x) => x.id !== v.id)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-[12px]">
        <button type="button" className="text-text2 underline cursor-pointer bg-transparent border-none p-0" onClick={() => onChange(JSON.stringify(all.map((v) => ({ id: v.id, name: shortName(v.name) }))))}>Select all</button>
        <button type="button" className="text-text2 underline cursor-pointer bg-transparent border-none p-0" onClick={() => onChange("[]")}>Clear</button>
        <span className="text-text3">{chosen.size} chosen</span>
        {!isGemini && <button type="button" className="ml-auto text-text2 underline cursor-pointer bg-transparent border-none p-0" onClick={() => setReloads((n) => n + 1)}>Reload voices</button>}
      </div>
      {defaultId && <span className="text-[12px] text-text3">★ Default voice: <strong className="text-text2">{shortName(all.find((v) => v.id === defaultId)?.name || list.find((v) => v.id === defaultId)?.name || defaultId)}</strong></span>}
      {!isGemini && account === null && <span className="text-[12px] text-text3">Loading voices from the account…</span>}
      {!isGemini && account?.length === 0 && <span className="text-[12px]" style={{ color: "#f59e0b" }}>No voices found — check the ElevenLabs API key above (paste a working key and Save), then Reload voices.</span>}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {all.map((v) => (
          <div key={v.id} className="flex items-start gap-2 p-2 rounded-lg border border-bg4 bg-bg3">
            <input type="checkbox" className="mt-0.5" checked={chosen.has(v.id)} onChange={(e) => toggle(v, e.target.checked)} />
            <span className="text-[12px] leading-tight flex-1 min-w-0">
              <strong className="text-text">{shortName(v.name)}</strong>{v.gender && <span className="text-text3"> ({v.gender})</span>}
              {v.desc && <><br /><span className="text-text3 text-[11px]">{v.desc}</span></>}
              {!isGemini && !v.freePlanOk && <><br /><span className="text-[10.5px]" style={{ color: "#f59e0b" }}>Needs a paid voice plan to speak live</span></>}
            </span>
            {onDefault && (
              <button
                type="button"
                title={v.id === defaultId ? "Default voice for calls" : "Make this the default voice"}
                className="text-[12px] px-1 bg-transparent border-none cursor-pointer"
                style={{ color: v.id === defaultId ? "#f59e0b" : "var(--color-text3)" }}
                onClick={() => {
                  onDefault(v.id);
                  if (!chosen.has(v.id)) toggle(v, true); // the default is always one of the client's voices
                }}
              >{v.id === defaultId ? "★" : "☆"}</button>
            )}
            {v.previewUrl && (
              <button
                type="button"
                title="Play sample"
                className="text-[11px] px-1.5 py-0.5 rounded bg-bg2 border border-bg4 text-text2 cursor-pointer"
                onClick={() => { audioRef.current?.pause(); audioRef.current = new Audio(v.previewUrl!); audioRef.current.play().catch(() => {}); }}
              >▶</button>
            )}
          </div>
        ))}
      </div>
      {!isGemini && (
        <div className="flex items-center gap-2">
          <input className="form-input text-[12.5px] flex-1" placeholder="Add another voice: voiceId | Name" value={extraId} onChange={(e) => setExtraId(e.target.value)} />
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-bg3 border border-bg4 text-text cursor-pointer"
            onClick={() => {
              const [id, name] = extraId.split("|").map((x) => x.trim());
              if (!id || chosen.has(id)) return;
              onChange(JSON.stringify([...list, { id, name: name || id }]));
              setExtraId("");
            }}
          >Add</button>
        </div>
      )}
      {list.filter((v) => !all.some((a) => a.id === v.id)).map((v) => (
        <span key={v.id} className="text-[12px] text-text2">
          {v.name} <span className="text-text3 font-mono">({v.id})</span>{" "}
          <button type="button" className="underline text-text3 bg-transparent border-none cursor-pointer p-0" onClick={() => onChange(JSON.stringify(list.filter((x) => x.id !== v.id)))}>remove</button>
        </span>
      ))}
    </div>
  );
}

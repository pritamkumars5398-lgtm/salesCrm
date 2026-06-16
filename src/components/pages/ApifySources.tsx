"use client";
import { useEffect, useState } from "react";
import {
  IconMap, IconBrandLinkedin, IconSearch, IconCode, IconCheck,
  IconChevronDown, IconChevronUp, IconKey, IconPlayerPlay, IconCircleFilled,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";

// ─── Scraper Definitions ────────────────────────────────────────────────────

type ScraperType = "google-maps" | "linkedin" | "justdial" | "custom";

interface ScraperDef {
  type: ScraperType;
  label: string;
  description: string;
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  defaultActorId: string;
  actorLink?: string;
  fields: { label: string; key: string; placeholder: string; hint?: string; type?: string; options?: string[] }[];
}

const SCRAPERS: ScraperDef[] = [
  {
    type: "google-maps",
    label: "Google Maps Scraper",
    description: "Scrape local businesses — perfect for carpenters, plumbers, electricians and any service business by city.",
    Icon: IconMap,
    iconBg: "rgba(16,185,129,0.1)",
    iconColor: "#10b981",
    defaultActorId: "nwua9Gu5YrADL7ZD",
    actorLink: "https://apify.com/compass/google-maps-scraper",
    fields: [
      { label: "Search Keyword", key: "gmKeyword", placeholder: "e.g. Carpenter, Plumber, Electrician", hint: "Combined with location → search query" },
      { label: "Location", key: "gmLocation", placeholder: "e.g. Lucknow, Mumbai, Delhi NCR" },
      { label: "Max Results", key: "gmMaxResults", placeholder: "25", hint: "Max businesses to scrape per run (1–100)" },
      { label: "Actor ID", key: "gmActorId", placeholder: "nwua9Gu5YrADL7ZD", hint: "Leave blank to use default stable actor" },
    ],
  },
  {
    type: "linkedin",
    label: "LinkedIn Scraper",
    description: "Scrape LinkedIn company pages or people profiles. Great for B2B outreach targeting specific roles or industries.",
    Icon: IconBrandLinkedin,
    iconBg: "rgba(10,102,194,0.1)",
    iconColor: "#0a66c2",
    defaultActorId: "",
    actorLink: "https://apify.com/apify/linkedin-scraper",
    fields: [
      { label: "Search Keywords", key: "liKeywords", placeholder: "e.g. Furniture manufacturer Lucknow", hint: "People or company search terms" },
      { label: "Country", key: "liCountry", placeholder: "e.g. India, US", hint: "Filter results by country" },
      { label: "Target", key: "liTarget", placeholder: "", options: ["Companies", "People"], hint: "What to scrape" },
      { label: "Max Results", key: "liMaxResults", placeholder: "20" },
      { label: "Actor ID", key: "liActorId", placeholder: "Paste Apify LinkedIn actor ID", hint: "Find actors at apify.com/store" },
    ],
  },
  {
    type: "justdial",
    label: "JustDial Scraper",
    description: "Scrape JustDial India — excellent for local Indian businesses with phone numbers for WhatsApp outreach.",
    Icon: IconSearch,
    iconBg: "rgba(245,130,32,0.1)",
    iconColor: "#f58220",
    defaultActorId: "",
    actorLink: "https://apify.com/store?search=justdial",
    fields: [
      { label: "Category / Keyword", key: "jdCategory", placeholder: "e.g. Carpenters, Furniture Shops, Interior Designers" },
      { label: "City", key: "jdCity", placeholder: "e.g. Lucknow, Kanpur, Agra" },
      { label: "Max Results", key: "jdMaxResults", placeholder: "30" },
      { label: "Actor ID", key: "jdActorId", placeholder: "Paste Apify JustDial actor ID", hint: "Find actors at apify.com/store" },
    ],
  },
  {
    type: "custom",
    label: "Custom Actor",
    description: "Use any Apify actor with a custom JSON input. Full control — for power users and custom scrapers.",
    Icon: IconCode,
    iconBg: "rgba(99,102,241,0.1)",
    iconColor: "#6366f1",
    defaultActorId: "",
    fields: [
      { label: "Actor ID", key: "customActorId", placeholder: "e.g. username~actor-name or alphanumeric ID" },
      { label: "Input JSON", key: "customActorInput", type: "textarea", placeholder: '{\n  "searchStringsArray": ["your search"],\n  "maxCrawledPlacesPerSearch": 25\n}', hint: "Raw JSON input sent to the actor" },
    ],
  },
];

// ─── Field Component ─────────────────────────────────────────────────────────

function Field({
  def, value, onChange,
}: {
  def: ScraperDef["fields"][0];
  value: string;
  onChange: (v: string) => void;
}) {
  const base: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--color-bg4)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text2)" }}>{def.label}</label>
      {def.options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...base, appearance: "none" }}>
          <option value="">Select…</option>
          {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : def.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          rows={5}
          style={{ ...base, resize: "vertical", lineHeight: 1.6, fontFamily: "monospace", fontSize: 12 }}
        />
      ) : def.type === "password" ? (
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          style={base}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          style={base}
        />
      )}
      {def.hint && (
        <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>{def.hint}</p>
      )}
    </div>
  );
}

// ─── Scraper Card ────────────────────────────────────────────────────────────

function ScraperCard({
  def, values, setValues, isActive, onSetActive, onSave, savedKey,
}: {
  def: ScraperDef;
  values: Record<string, string>;
  setValues: (patch: Record<string, string>) => void;
  isActive: boolean;
  onSetActive: () => void;
  onSave: (fields: string[]) => void;
  savedKey: string | null;
}) {
  const [open, setOpen] = useState(isActive);
  const isSaved = savedKey === def.type;

  return (
    <div
      style={{
        border: `1px solid ${isActive ? "rgba(79,70,229,0.3)" : "var(--color-bg4)"}`,
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--color-bg2)",
        boxShadow: isActive ? "0 0 0 3px rgba(79,70,229,0.07)" : "none",
        transition: "box-shadow 0.2s, border-color 0.2s",
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 18px",
          cursor: "pointer",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          style={{
            width: 38, height: 38, borderRadius: 10,
            background: def.iconBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <def.Icon size={18} style={{ color: def.iconColor }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{def.label}</p>
            {isActive && (
              <span style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 10.5, fontWeight: 700,
                padding: "2px 8px", borderRadius: 99,
                background: "rgba(16,185,129,0.1)", color: "#10b981",
                border: "1px solid rgba(16,185,129,0.2)",
              }}>
                <IconCircleFilled size={6} /> Active
              </span>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "2px 0 0", lineHeight: 1.4 }}>{def.description}</p>
        </div>
        <span style={{ color: "var(--color-text3)", flexShrink: 0 }}>
          {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </span>
      </div>

      {/* Expanded config */}
      {open && (
        <div style={{ borderTop: "1px solid var(--color-bg4)", padding: "18px 18px 20px" }}>
          {def.actorLink && (
            <a
              href={def.actorLink}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11.5, color: "#6366f1", display: "inline-block", marginBottom: 16, textDecoration: "none" }}
            >
              Find actor on Apify Store →
            </a>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {def.fields.map((f) => (
              <div key={f.key} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : {}}>
                <Field
                  def={f}
                  value={values[f.key] ?? ""}
                  onChange={(v) => setValues({ [f.key]: v })}
                />
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
            {!isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onSetActive(); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", borderRadius: 9,
                  background: "var(--color-bg3)", border: "1px solid var(--color-bg4)",
                  color: "var(--color-text2)", fontSize: 12.5, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <IconPlayerPlay size={13} /> Set as Active
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onSave(def.fields.map((f) => f.key)); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 9,
                background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                border: "none", color: "#fff", fontSize: 12.5, fontWeight: 700,
                cursor: "pointer", boxShadow: "0 4px 12px rgba(79,70,229,0.28)",
              }}
            >
              {isSaved ? <><IconCheck size={13} /> Saved</> : "Save config"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ApifySources() {
  const { activeAgent, showToast } = useAppStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [tokenSaved, setTokenSaved] = useState(false);

  const allSettingKeys = [
    "apifyToken", "activeScraperType",
    ...SCRAPERS.flatMap((s) => s.fields.map((f) => f.key)),
  ];

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/settings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((data) => {
        const filtered: Record<string, string> = {};
        allSettingKeys.forEach((k) => { if (data[k] !== undefined) filtered[k] = data[k]; });
        // Seed defaults
        if (!filtered.activeScraperType) filtered.activeScraperType = "google-maps";
        if (!filtered.gmActorId) filtered.gmActorId = "nwua9Gu5YrADL7ZD";
        if (!filtered.gmKeyword && data.industry) filtered.gmKeyword = data.industry;
        if (!filtered.gmLocation && data.leadLocation) filtered.gmLocation = data.leadLocation;
        if (!filtered.gmMaxResults) filtered.gmMaxResults = "25";
        setValues(filtered);
      });
  }, [activeAgent?._id]);

  function patchValues(patch: Record<string, string>) {
    setValues((prev) => ({ ...prev, ...patch }));
  }

  async function saveSettings(keys: string[]) {
    if (!activeAgent) return;
    const patch: Record<string, string> = {};
    keys.forEach((k) => { patch[k] = values[k] ?? ""; });
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: activeAgent._id, settings: patch }),
    });
  }

  async function handleTokenSave() {
    await saveSettings(["apifyToken"]);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2500);
    showToast("Apify token saved");
  }

  async function handleSetActive(type: ScraperType) {
    patchValues({ activeScraperType: type });
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: activeAgent?._id,
        settings: { activeScraperType: type },
      }),
    });
    showToast(`Active scraper set to ${SCRAPERS.find((s) => s.type === type)?.label}`);
  }

  async function handleSaveCard(type: ScraperType, keys: string[]) {
    await saveSettings(keys);
    setSavedKey(type);
    setTimeout(() => setSavedKey(null), 2500);
    showToast("Scraper config saved");
  }

  const activeType = (values.activeScraperType ?? "google-maps") as ScraperType;

  return (
    <div style={{ maxWidth: 740, padding: "28px 28px 48px" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text)", margin: "0 0 6px" }}>
          Apify Lead Sources
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0, lineHeight: 1.6 }}>
          Configure scrapers to automatically pull leads from Google Maps, LinkedIn, JustDial, or any custom Apify actor.
          The <strong style={{ color: "var(--color-text2)" }}>active</strong> scraper runs when you click <em>Sync Apify</em> in the top bar.
        </p>
      </div>

      {/* Token card */}
      <div
        style={{
          background: "var(--color-bg2)",
          border: "1px solid var(--color-bg4)",
          borderRadius: 14,
          padding: "18px 20px",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconKey size={15} style={{ color: "#6366f1" }} />
          </span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>Apify API Token</p>
            <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: 0 }}>Shared across all scrapers — get it from apify.com/account/integrations</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="password"
            value={values.apifyToken ?? ""}
            onChange={(e) => patchValues({ apifyToken: e.target.value })}
            placeholder="apify_api_..."
            style={{
              flex: 1, padding: "9px 13px", borderRadius: 9,
              border: "1px solid var(--color-bg4)", background: "var(--color-bg)",
              color: "var(--color-text)", fontSize: 13, outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleTokenSave}
            style={{
              padding: "9px 18px", borderRadius: 9,
              background: tokenSaved ? "rgba(16,185,129,0.15)" : "linear-gradient(135deg,#4f46e5,#6366f1)",
              border: tokenSaved ? "1px solid rgba(16,185,129,0.3)" : "none",
              color: tokenSaved ? "#10b981" : "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.2s",
            }}
          >
            {tokenSaved ? <><IconCheck size={13} /> Saved</> : "Save"}
          </button>
        </div>
      </div>

      {/* Section label */}
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text3)", marginBottom: 12 }}>
        Scrapers
      </p>

      {/* Scraper cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SCRAPERS.map((def) => (
          <ScraperCard
            key={def.type}
            def={def}
            values={values}
            setValues={patchValues}
            isActive={activeType === def.type}
            onSetActive={() => handleSetActive(def.type)}
            onSave={(keys) => handleSaveCard(def.type, keys)}
            savedKey={savedKey}
          />
        ))}
      </div>
    </div>
  );
}

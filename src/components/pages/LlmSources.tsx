"use client";
import { useEffect, useState } from "react";
import {
  IconBrain, IconKey, IconCheck, IconTerminal2, IconChevronDown, IconChevronUp, IconCircleFilled, IconSettings, IconRobot
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import SettingsToggle from "@/components/settings/SettingsToggle";

type LlmProvider = "openai" | "anthropic" | "gemini";

interface ProviderDef {
  type: LlmProvider;
  label: string;
  description: string;
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  fields: { label: string; key: string; placeholder: string; hint?: string; type?: string; options?: { label: string, value: string }[] }[];
}

const PROVIDERS: ProviderDef[] = [
  {
    type: "openai",
    label: "OpenAI (ChatGPT)",
    description: "Use OpenAI models to generate or synthesize leads.",
    Icon: IconRobot,
    iconBg: "rgba(16,185,129,0.1)",
    iconColor: "#10b981",
    fields: [
      {
        label: "Model",
        key: "openaiModel",
        placeholder: "",
        type: "select",
        options: [
          { label: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
          { label: "GPT-5.6 Terra", value: "gpt-5.6-terra" },
          { label: "GPT-5.6 Luna", value: "gpt-5.6-luna" },
          { label: "GPT-5.5 Pro", value: "gpt-5.5-pro" },
          { label: "GPT-4o", value: "gpt-4o" },
          { label: "GPT-4o Mini", value: "gpt-4o-mini" },
          { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
          { label: "GPT-4", value: "gpt-4" },
          { label: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" }
        ]
      },
      { label: "API Key", key: "openaiApiKey", type: "password", placeholder: "Enter OpenAI API Key", hint: "Stored securely." },
    ]
  },
  {
    type: "anthropic",
    label: "Anthropic (Claude)",
    description: "Use Claude models for advanced extraction and generation.",
    Icon: IconBrain,
    iconBg: "rgba(217,119,87,0.1)",
    iconColor: "#d97757",
    fields: [
      {
        label: "Model",
        key: "anthropicModel",
        placeholder: "",
        type: "select",
        options: [
          { label: "Claude Fable 5", value: "claude-fable-5" },
          { label: "Claude Sonnet 5", value: "claude-sonnet-5" },
          { label: "Claude Opus 4.8", value: "claude-opus-4-8" },
          { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
          { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022" },
          { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-20241022" },
          { label: "Claude 3 Opus", value: "claude-3-opus-20240229" },
          { label: "Claude 3 Sonnet", value: "claude-3-sonnet-20240229" },
          { label: "Claude 3 Haiku", value: "claude-3-haiku-20240307" }
        ]
      },
      { label: "API Key", key: "anthropicApiKey", type: "password", placeholder: "Enter Anthropic API Key", hint: "Stored securely." },
    ]
  },
  {
    type: "gemini",
    label: "Google (Gemini)",
    description: "Use Gemini models for fast and cost-effective generation.",
    Icon: IconSettings,
    iconBg: "rgba(66,133,244,0.1)",
    iconColor: "#4285f4",
    fields: [
      {
        label: "Model",
        key: "geminiModel",
        placeholder: "",
        type: "select",
        options: [
          { label: "Gemini 3.5 Flash", value: "gemini-3.5-flash" },
          { label: "Gemini 3.1 Flash Lite", value: "gemini-3.1-flash-lite" },
          { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
          { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
          { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
          { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
          { label: "Gemini 1.5 Flash-8B", value: "gemini-1.5-flash-8b" },
          { label: "Gemini 1.0 Pro", value: "gemini-1.0-pro" },
          { label: "Gemini Pro Vision", value: "gemini-pro-vision" }
        ]
      },
      { label: "API Key", key: "geminiApiKey", type: "password", placeholder: "Enter Gemini API Key", hint: "Stored securely." },
    ]
  },
];

const DEFAULT_PROMPT = `Find me 5 leads of marketing agencies based in New York.
Return ONLY a valid JSON array of objects with the following keys for each lead:
- firstName
- lastName
- company
- jobTitle
- email
- phone
- website
- location`;

function Field({
  def, value, onChange,
}: {
  def: ProviderDef["fields"][0];
  value: string;
  onChange: (v: string) => void;
}) {
  const base: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 9,
    border: "1px solid var(--color-bg4)", background: "var(--color-bg)",
    color: "var(--color-text)", fontSize: 13, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>{def.label}</label>
      {def.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...base, appearance: "none" }}>
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : def.type === "password" ? (
        <input type="password" value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} style={base} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.placeholder} style={base} />
      )}
      {def.hint && <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>{def.hint}</p>}
    </div>
  );
}

function ProviderCard({
  def, values, setValues, isEnabled, onToggleEnabled, onSave, savedKey,
}: {
  def: ProviderDef;
  values: Record<string, string>;
  setValues: (patch: Record<string, string>) => void;
  isEnabled: boolean;
  onToggleEnabled: (v: boolean) => void;
  onSave: (fields: string[]) => void;
  savedKey: string | null;
}) {
  const [open, setOpen] = useState(isEnabled);
  const isSaved = savedKey === def.type;

  return (
    <div
      style={{
        border: `1px solid ${isEnabled ? "rgba(79,70,229,0.3)" : "var(--color-bg4)"}`,
        borderRadius: 14, overflow: "hidden",
        background: isEnabled ? "var(--color-bg2)" : "var(--color-bg)",
        boxShadow: isEnabled ? "0 0 0 3px rgba(79,70,229,0.07)" : "none",
        transition: "box-shadow 0.2s, border-color 0.2s, opacity 0.2s",
        opacity: isEnabled ? 1 : 0.55,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ width: 38, height: 38, borderRadius: 10, background: def.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <def.Icon size={18} style={{ color: def.iconColor }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{def.label}</p>
            {isEnabled && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
                <IconCircleFilled size={6} /> Active
              </span>
            )}
            {!isEnabled && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}>
                Disabled
              </span>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "2px 0 0", lineHeight: 1.4 }}>{def.description}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleEnabled(!isEnabled); }}
          style={{ width: 38, height: 22, borderRadius: 11, background: isEnabled ? "#4f46e5" : "#cbd5e1", border: "none", cursor: "pointer", padding: 0, position: "relative", flexShrink: 0, transition: "background 0.2s" }}
        >
          <span style={{ position: "absolute", top: 3, left: isEnabled ? 19 : 3, width: 16, height: 16, borderRadius: "50%", background: "var(--color-bg2)", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s ease", display: "block" }} />
        </button>
        <span style={{ color: "var(--color-text3)", flexShrink: 0 }}>
          {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </span>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--color-bg4)", padding: "18px 18px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {def.fields.map((f) => (
              <div key={f.key} style={f.type === "textarea" ? { gridColumn: "1 / -1" } : {}}>
                <Field def={f} value={values[f.key] ?? (f.type === "select" && f.options ? f.options[0].value : "")} onChange={(v) => setValues({ [f.key]: v })} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onSave(def.fields.map((f) => f.key)); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, background: "linear-gradient(135deg, #4f46e5, #6366f1)", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(79,70,229,0.28)" }}
            >
              {isSaved ? <><IconCheck size={13} /> Saved</> : "Save config"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LlmSources() {
  const { activeAgent, showToast } = useAppStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const enabledKey = (type: string) => `${type}Enabled`;

  const allSettingKeys = [
    "llmPrompt",
    ...PROVIDERS.map((s) => enabledKey(s.type)),
    ...PROVIDERS.flatMap((s) => s.fields.map((f) => f.key)),
  ];

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/settings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((data) => {
        const filtered: Record<string, string> = {};
        allSettingKeys.forEach((k) => { if (data[k] !== undefined) filtered[k] = data[k]; });
        if (!filtered.llmPrompt) filtered.llmPrompt = DEFAULT_PROMPT;
        // set default model values if not present
        PROVIDERS.forEach((p) => {
          p.fields.forEach((f) => {
            if (f.type === "select" && !filtered[f.key] && f.options) {
              filtered[f.key] = f.options[0].value;
            }
          });
        });
        setValues(filtered);
      });
  }, [activeAgent?._id]);

  function patchValues(patch: Record<string, string>) {
    setValues((prev) => ({ ...prev, ...patch }));
  }

  async function handleSaveKeys(keys: string[], componentKey: string) {
    if (!activeAgent) return;
    const patch: Record<string, string> = {};
    keys.forEach((k) => { patch[k] = values[k] ?? ""; });

    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, settings: patch }),
      });
      setSavedKey(componentKey);
      setTimeout(() => setSavedKey(null), 2500);
      showToast("Config saved");
    } catch (err) {
      showToast("Failed to save settings", "error");
    }
  }

  async function handleSavePrompt() {
    if (!activeAgent) return;
    setSavingPrompt(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, settings: { llmPrompt: values.llmPrompt } }),
      });
      showToast("Global prompt saved", "success");
    } catch (err) {
      showToast("Failed to save prompt", "error");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function toggleEnabled(type: string, current: boolean) {
    if (!activeAgent) return;
    const newVal = !current;
    patchValues({ [enabledKey(type)]: String(newVal) });
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, settings: { [enabledKey(type)]: String(newVal) } }),
      });
    } catch {
      showToast("Failed to toggle scraper", "error");
    }
  }

  const isMasterEnabled = values.llmScraperEnabled !== "false";

  async function handleMasterToggle(enabled: boolean) {
    if (!activeAgent) return;
    patchValues({ llmScraperEnabled: String(enabled) });
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: activeAgent._id,
        settings: { llmScraperEnabled: String(enabled) },
      }),
    });
    showToast(`LLM scraper ${enabled ? "enabled" : "disabled"}`);
  }

  const baseInputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 13px", borderRadius: 9,
    border: "1px solid var(--color-bg4)", background: "var(--color-bg)",
    color: "var(--color-text)", fontSize: 13, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ maxWidth: 740, padding: "28px 28px 48px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text)", margin: "0 0 6px" }}>
            LLM Scraper Sources
          </h2>
          <p style={{ fontSize: 13, color: "var(--color-text3)", margin: 0, lineHeight: 1.6 }}>
            Enable one or more AI providers below. When you click <strong>Sync Sources</strong> in the topbar, they will all run simultaneously to generate or extract leads based on the master prompt below.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--color-bg2)", padding: "8px 12px", borderRadius: 12, border: "1px solid var(--color-bg4)" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: isMasterEnabled ? "var(--color-text)" : "var(--color-text3)" }}>
            {isMasterEnabled ? "Enabled" : "Disabled"}
          </span>
          <SettingsToggle checked={isMasterEnabled} onChange={handleMasterToggle} />
        </div>
      </div>

      <div style={{ opacity: isMasterEnabled ? 1 : 0.4, pointerEvents: isMasterEnabled ? "auto" : "none", transition: "opacity 0.2s" }}>


      <div style={{ background: "var(--color-bg2)", border: "1px solid var(--color-bg4)", borderRadius: 14, padding: "20px", marginBottom: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6 }}>
            <IconTerminal2 size={16} /> Global Scraper Prompt
          </label>
          <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "0 0 8px" }}>
            This prompt is sent to all active LLMs below. Be highly specific and request real, verifiable business data for the best results.
          </p>
          <textarea
            style={{ ...baseInputStyle, resize: "vertical", minHeight: "150px", fontFamily: "monospace", fontSize: 12, lineHeight: 1.5 }}
            placeholder="Write your prompt to generate leads..."
            spellCheck={false}
            value={values.llmPrompt || ""}
            onChange={(e) => patchValues({ llmPrompt: e.target.value })}
          />
          <div style={{ display: "flex", marginTop: 10 }}>
            <button
              onClick={handleSavePrompt}
              disabled={savingPrompt}
              style={{ padding: "8px 16px", borderRadius: 9, background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text2)", fontSize: 12, fontWeight: 600, cursor: savingPrompt ? "not-allowed" : "pointer" }}
            >
              {savingPrompt ? "Saving..." : "Save Prompt"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PROVIDERS.map((def) => {
          const isEnabled = values[enabledKey(def.type)] === "true";
          return (
            <ProviderCard
              key={def.type}
              def={def}
              values={values}
              setValues={patchValues}
              isEnabled={isEnabled}
              onToggleEnabled={(v) => toggleEnabled(def.type, isEnabled)}
              onSave={(keys) => handleSaveKeys(keys, def.type)}
              savedKey={savedKey}
            />
          );
        })}
      </div>
      </div>
    </div>
  );
}

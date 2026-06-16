"use client";
import { useEffect, useState } from "react";
import {
  IconBrain, IconBrandWhatsapp, IconPhone, IconMail, IconMessage, IconCheck, IconBuilding, IconDatabase,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import ApifySources from "@/components/pages/ApifySources";

interface Field {
  label: string;
  key: string;
  type?: string;
  placeholder: string;
  hint?: string;
  options?: string[];
}

interface SettingCard {
  key: string;
  title: string;
  description: string;
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  togglable?: boolean;
  fields: Field[];
}

const GENERAL_CARDS: SettingCard[] = [
  {
    key: "profile",
    title: "Business Profile",
    description: "Your business type & lead targeting",
    Icon: IconBuilding,
    iconBg: "rgba(16,185,129,0.1)",
    iconColor: "#10b981",
    fields: [
      { label: "Business Type", key: "businessType", placeholder: "", options: ["B2B SaaS", "E-commerce", "Real Estate", "Consulting / Agency", "Finance", "Healthcare", "Recruitment", "Other"] },
      { label: "Industry", key: "industry", placeholder: "e.g. Technology, Retail, Education...", hint: "Helps AI tailor messaging tone" },
      { label: "Target Location of Leads", key: "leadLocation", placeholder: "e.g. India, USA, Global, Mumbai...", hint: "City, country or region" },
      { label: "Target Company Size", key: "targetCompanySize", placeholder: "", options: ["Any", "1–10 (Micro)", "11–50 (Small)", "51–200 (Mid-market)", "201–1000 (Growth)", "1000+ (Enterprise)"] },
    ],
  },
];

const CARDS: SettingCard[] = [
  {
    key: "llm",
    title: "AI Brain",
    description: "Language model & API credentials",
    Icon: IconBrain,
    iconBg: "rgba(99,102,241,0.1)",
    iconColor: "#6366f1",
    fields: [
      { label: "Provider", key: "llmProvider", placeholder: "", options: ["Claude (Anthropic)", "GPT-4o (OpenAI)", "Gemini 1.5 Pro"], hint: "Model used for all AI responses" },
      { label: "API Key", key: "llmApiKey", type: "password", placeholder: "sk-ant-...", hint: "Stored encrypted, never exposed" },
    ],
  },
  {
    key: "whatsapp",
    title: "WhatsApp",
    description: "Send & receive WhatsApp messages",
    Icon: IconBrandWhatsapp,
    iconBg: "rgba(34,201,122,0.1)",
    iconColor: "#22c97a",
    togglable: true,
    fields: [
      { label: "Provider", key: "waProvider", placeholder: "", options: ["Twilio", "360dialog", "Meta Business API"] },
      { label: "API Key", key: "waApiKey", type: "password", placeholder: "Enter API key" },
    ],
  },
  {
    key: "voice",
    title: "Voice Calls",
    description: "Outbound & inbound AI voice calls",
    Icon: IconPhone,
    iconBg: "rgba(245,166,35,0.1)",
    iconColor: "#f5a623",
    togglable: true,
    fields: [
      { label: "Call Provider", key: "callProvider", placeholder: "", options: ["Vapi.ai", "Twilio Voice", "Bland.ai"], hint: "Handles call routing" },
      { label: "Call API Key", key: "callApiKey", type: "password", placeholder: "Enter API key" },
      { label: "Voice Provider", key: "voiceProvider", placeholder: "", options: ["ElevenLabs", "Deepgram", "PlayHT"], hint: "Text-to-speech engine" },
      { label: "Voice API Key", key: "voiceApiKey", type: "password", placeholder: "Enter API key" },
    ],
  },
  {
    key: "email",
    title: "Email",
    description: "Outreach emails via SMTP or API providers",
    Icon: IconMail,
    iconBg: "rgba(77,171,247,0.1)",
    iconColor: "#4dabf7",
    togglable: true,
    fields: [
      { label: "Provider", key: "emailProvider", placeholder: "", options: ["SMTP", "Resend", "SendGrid", "Mailgun"], hint: "Choose how emails are sent" },
      { label: "API Key", key: "emailApiKey", type: "password", placeholder: "API key (Resend / SendGrid / Mailgun)", hint: "Not needed for SMTP" },
      { label: "SMTP Host", key: "smtpHost", placeholder: "smtp.gmail.com", hint: "SMTP only — e.g. smtp.gmail.com, smtp.zoho.com" },
      { label: "SMTP Port", key: "smtpPort", placeholder: "587", hint: "SMTP only — 587 (TLS) · 465 (SSL)" },
      { label: "SMTP Username", key: "smtpUser", placeholder: "you@gmail.com", hint: "SMTP only — usually your email address" },
      { label: "SMTP Password", key: "smtpPass", type: "password", placeholder: "App password", hint: "Gmail: use App Password (not login password)" },
      { label: "From Name", key: "smtpFromName", placeholder: "Carpenter Agent", hint: "Display name shown to recipients" },
      { label: "From Address", key: "smtpFrom", placeholder: "you@gmail.com", hint: "Sender email address" },
    ],
  },
  {
    key: "sms",
    title: "SMS",
    description: "Text message outreach & alerts",
    Icon: IconMessage,
    iconBg: "rgba(204,153,255,0.1)",
    iconColor: "#cc99ff",
    togglable: true,
    fields: [
      { label: "Provider", key: "smsProvider", placeholder: "", options: ["Twilio SMS", "MSG91", "Plivo"] },
      { label: "API Key", key: "smsApiKey", type: "password", placeholder: "Enter API key" },
      { label: "From Number", key: "smsFrom", placeholder: "+91xxxxxxxxxx", hint: "Must be registered with provider" },
    ],
  },
];

function NavItem({
  card, active, toggles, setActive,
}: {
  card: SettingCard;
  active: string;
  toggles: Record<string, boolean>;
  setActive: (k: string) => void;
}) {
  const isActive = active === card.key;
  return (
    <button
      onClick={() => setActive(card.key)}
      className="flex items-center gap-2.5 w-full text-left transition-all duration-150"
      style={{
        padding: "8px 10px",
        borderRadius: 10,
        background: isActive ? "rgba(79,70,229,0.08)" : "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      <span
        className="shrink-0 flex items-center justify-center"
        style={{ width: 30, height: 30, borderRadius: 8, background: isActive ? card.iconBg : "var(--color-bg3)" }}
      >
        <card.Icon size={15} style={{ color: isActive ? card.iconColor : "var(--color-text3)" }} />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold leading-none truncate" style={{ color: isActive ? "#4f46e5" : "var(--color-text)" }}>
          {card.title}
        </p>
        <p className="text-[10.5px] leading-tight mt-0.5 truncate" style={{ color: "var(--color-text3)" }}>
          {card.description}
        </p>
      </div>
      {card.togglable && (
        <span
          className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ background: toggles[card.key] !== false ? "#10b981" : "#cbd5e1" }}
        />
      )}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 transition-colors duration-200"
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? "#4f46e5" : "#cbd5e1",
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s ease",
          display: "block",
        }}
      />
    </button>
  );
}

function SavedBadge() {
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#10b981" }}>
      <IconCheck size={12} /> Saved
    </span>
  );
}

export default function Settings() {
  const { activeAgent, showToast } = useAppStore();
  const [active, setActive] = useState("profile");
  const [values, setValues] = useState<Record<string, string>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/settings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((data) => {
        setValues(data);
        const t: Record<string, boolean> = {};
        CARDS.filter((c) => c.togglable).forEach((c) => { t[c.key] = data[`${c.key}Enabled`] !== "false"; });
        setToggles(t);
      });
  }, [activeAgent?._id]);

  async function saveCard(card: SettingCard) {
    if (!activeAgent) return;
    const patch: Record<string, string> = {};
    card.fields.forEach((f) => { patch[f.key] = values[f.key] ?? ""; });
    if (card.togglable) patch[`${card.key}Enabled`] = String(toggles[card.key] ?? true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: activeAgent._id, settings: patch }),
    });
    setSaved((p) => ({ ...p, [card.key]: true }));
    setTimeout(() => setSaved((p) => ({ ...p, [card.key]: false })), 2500);
    showToast(`${card.title} settings saved`);
  }

  const ALL_CARDS = [...GENERAL_CARDS, ...CARDS];
  const activeCard = ALL_CARDS.find((c) => c.key === active);
  const isSourcesPage = active === "apify";

  return (
    <div className="flex h-full" style={{ background: "var(--color-bg)" }}>
      {/* Left nav */}
      <div
        className="flex flex-col gap-1 p-3 shrink-0"
        style={{
          width: 220,
          borderRight: "1px solid var(--color-bg4)",
          background: "var(--color-bg2)",
          paddingTop: 20,
        }}
      >
        {/* General section */}
        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1" style={{ color: "var(--color-text3)" }}>
          General
        </p>
        {GENERAL_CARDS.map((card) => <NavItem key={card.key} card={card} active={active} toggles={toggles} setActive={setActive} />)}

        {/* Integrations section */}
        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1 mt-4" style={{ color: "var(--color-text3)" }}>
          Integrations
        </p>
        {CARDS.map((card) => <NavItem key={card.key} card={card} active={active} toggles={toggles} setActive={setActive} />)}

        {/* Sources section */}
        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1 mt-4" style={{ color: "var(--color-text3)" }}>
          Sources
        </p>
        <button
          onClick={() => setActive("apify")}
          className="flex items-center gap-2.5 w-full text-left transition-all duration-150"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: active === "apify" ? "rgba(79,70,229,0.08)" : "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: active === "apify" ? "rgba(99,102,241,0.12)" : "var(--color-bg3)",
            }}
          >
            <IconDatabase size={15} style={{ color: active === "apify" ? "#6366f1" : "var(--color-text3)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-none truncate" style={{ color: active === "apify" ? "#4f46e5" : "var(--color-text)" }}>
              Apify Scrapers
            </p>
            <p className="text-[10.5px] leading-tight mt-0.5 truncate" style={{ color: "var(--color-text3)" }}>
              Google Maps, LinkedIn & more
            </p>
          </div>
        </button>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto" style={isSourcesPage ? {} : { maxWidth: 560, padding: "2rem" }}>
        {isSourcesPage ? (
          <ApifySources />
        ) : activeCard ? (
          <>
        {/* Card header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center justify-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: activeCard.iconBg,
              }}
            >
              <activeCard.Icon size={20} style={{ color: activeCard.iconColor }} />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold leading-tight" style={{ color: "var(--color-text)" }}>
                {activeCard.title}
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text3)" }}>
                {activeCard.description}
              </p>
            </div>
          </div>
          {activeCard.togglable && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[12px]" style={{ color: "var(--color-text3)" }}>
                {toggles[activeCard.key] !== false ? "Enabled" : "Disabled"}
              </span>
              <Toggle
                checked={toggles[activeCard.key] !== false}
                onChange={(v) => setToggles((p) => ({ ...p, [activeCard.key]: v }))}
              />
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--color-bg4)", marginBottom: 24 }} />

        {/* Fields */}
        <div className="flex flex-col gap-5">
          {activeCard.fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold" style={{ color: "var(--color-text2)" }}>
                  {f.label}
                </label>
                {f.hint && (
                  <span className="text-[10.5px]" style={{ color: "var(--color-text3)" }}>
                    {f.hint}
                  </span>
                )}
              </div>
              {f.options ? (
                <select
                  className="w-full rounded-[10px] px-3 py-2.5 text-[13px] outline-none"
                  style={{
                    background: "var(--color-bg2)",
                    border: "1px solid var(--color-bg4)",
                    color: "var(--color-text)",
                  }}
                  value={values[f.key] ?? f.options[0]}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                >
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className="w-full rounded-[10px] px-3 py-2.5 text-[13px] outline-none"
                  style={{
                    background: "var(--color-bg2)",
                    border: "1px solid var(--color-bg4)",
                    color: "var(--color-text)",
                  }}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>

        {/* Save row */}
        <div className="flex items-center justify-between mt-8 pt-5" style={{ borderTop: "1px solid var(--color-bg4)" }}>
          {saved[activeCard.key] ? <SavedBadge /> : <span />}
          <button
            onClick={() => saveCard(activeCard)}
            className="flex items-center justify-center"
            style={{
              padding: "8px 20px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Save changes
          </button>
        </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

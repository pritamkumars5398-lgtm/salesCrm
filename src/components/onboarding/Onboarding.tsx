"use client";
import { useState } from "react";
import {
  IconArrowRight, IconChevronLeft, IconCheck, IconBuilding, IconUser,
  IconBrandWhatsapp, IconMail, IconPhone, IconMessage,
  IconMap, IconBrandLinkedin, IconConfetti, IconSparkles,
} from "@tabler/icons-react";

// ─── types ──────────────────────────────────────────────────────────────────

interface OnboardingData {
  // step 1 — business profile
  businessName: string;
  businessType: string;
  industry: string;
  location: string;
  // step 2 — channels
  channels: string[];
  // step 3 — lead source
  leadSources: string[];
  // step 4 — agent
  agentName: string;
  apifyToken: string;
  // step 5 — feedback
  teamSize: string;
  goal: string;
}

interface OnboardingProps {
  userName: string;
  userEmail: string;
  onComplete: (data: OnboardingData) => Promise<void>;
}

// ─── constants ───────────────────────────────────────────────────────────────

const BUSINESS_TYPES = ["B2B SaaS", "E-commerce", "Real Estate", "Consulting / Agency", "Finance", "Healthcare", "Recruitment", "Other"];
const TEAM_SIZES     = ["Just me", "2–5", "6–20", "21–100", "100+"];
const GOALS          = [
  "Book more sales meetings",
  "Nurture and follow up leads",
  "Qualify inbound leads faster",
  "Build outreach campaigns",
  "All of the above",
];

const CHANNEL_OPTIONS = [
  { id: "email",     label: "Email",     Icon: IconMail,           color: "#4dabf7", bg: "rgba(77,171,247,0.1)",  desc: "Personalized email sequences" },
  { id: "whatsapp",  label: "WhatsApp",  Icon: IconBrandWhatsapp,  color: "#22c97a", bg: "rgba(34,201,122,0.1)",  desc: "High open-rate outreach" },
  { id: "sms",       label: "SMS",       Icon: IconMessage,        color: "#cc99ff", bg: "rgba(204,153,255,0.1)", desc: "Quick text follow-ups" },
  { id: "call",      label: "Voice Call",Icon: IconPhone,          color: "#f5a623", bg: "rgba(245,166,35,0.1)",  desc: "AI voice calls with transcripts" },
];

const SOURCE_OPTIONS = [
  { id: "google-maps", label: "Google Maps",  Icon: IconMap,           color: "#10b981", bg: "rgba(16,185,129,0.1)",  desc: "Local businesses, cafes, shops, services" },
  { id: "linkedin",    label: "LinkedIn",     Icon: IconBrandLinkedin, color: "#0a66c2", bg: "rgba(10,102,194,0.1)",  desc: "Professionals, decision makers, B2B" },
];

// ─── shared input style ───────────────────────────────────────────────────────

const inputSx: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--color-bg4)",
  background: "var(--color-bg)",
  color: "var(--color-text)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

// ─── progress dots ────────────────────────────────────────────────────────────

function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 20 : 7,
            height: 7,
            borderRadius: 99,
            background: i <= current ? "#4f46e5" : "var(--color-bg4)",
            transition: "all 0.25s ease",
          }}
        />
      ))}
    </div>
  );
}

// ─── option card (channels / sources) ────────────────────────────────────────

function OptionCard({
  id, label, desc, Icon, color, bg, selected, onToggle,
}: {
  id: string; label: string; desc: string;
  Icon: React.ElementType; color: string; bg: string;
  selected: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px", borderRadius: 14, cursor: "pointer",
        background: selected ? `${color}0d` : "var(--color-bg)",
        border: `1.5px solid ${selected ? color : "var(--color-bg4)"}`,
        boxShadow: selected ? `0 0 0 3px ${color}18` : "none",
        transition: "all 0.15s", textAlign: "left", width: "100%",
      }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={18} style={{ color }} />
      </span>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11.5, color: "var(--color-text3)", margin: "2px 0 0" }}>{desc}</p>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
        background: selected ? color : "transparent",
        border: `2px solid ${selected ? color : "var(--color-bg4)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}>
        {selected && <IconCheck size={10} style={{ color: "#fff" }} />}
      </div>
    </button>
  );
}

// ─── main onboarding component ────────────────────────────────────────────────

const TOTAL_STEPS = 5;

export default function Onboarding({ userName, userEmail, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    businessName: "",
    businessType: "",
    industry: "",
    location: "",
    channels: ["email", "whatsapp"],
    leadSources: ["google-maps"],
    agentName: "",
    apifyToken: "",
    teamSize: "",
    goal: "",
  });

  function patch(updates: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...updates }));
  }

  function toggleArr(key: "channels" | "leadSources", value: string) {
    setData((prev) => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  async function finish() {
    setSaving(true);
    try { await onComplete(data); } finally { setSaving(false); }
  }

  // ── step renderers ──────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      // STEP 0 — Welcome
      case 0:
        return (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <IconSparkles size={28} style={{ color: "#6366f1" }} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text)", margin: "0 0 10px" }}>
              Welcome, {userName.split(" ")[0]} 👋
            </h2>
            <p style={{ fontSize: 14, color: "var(--color-text3)", lineHeight: 1.7, margin: "0 0 28px" }}>
              Let's set up your AI sales agent in 2 minutes. We'll ask a few quick questions so everything is personalised to your business.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business / company name</label>
                <input style={inputSx} placeholder="e.g. Acme Pvt. Ltd." value={data.businessName} onChange={(e) => patch({ businessName: e.target.value })} autoFocus />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Business type</label>
                <select style={{ ...inputSx, appearance: "none" }} value={data.businessType} onChange={(e) => patch({ businessType: e.target.value })}>
                  <option value="">Select…</option>
                  {BUSINESS_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
        );

      // STEP 1 — Business details
      case 1:
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconBuilding size={18} style={{ color: "#10b981" }} />
              </span>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text)", margin: 0 }}>Your target market</h3>
                <p style={{ fontSize: 12, color: "var(--color-text3)", margin: 0 }}>Helps the AI tailor every message</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Industry / product you sell</label>
                <input style={inputSx} placeholder="e.g. Carpenter tools, SaaS software, Interior design" value={data.industry} onChange={(e) => patch({ industry: e.target.value })} autoFocus />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Target city / region</label>
                <input style={inputSx} placeholder="e.g. Lucknow, Mumbai, Pan India" value={data.location} onChange={(e) => patch({ location: e.target.value })} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Team size</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TEAM_SIZES.map((t) => (
                    <button
                      key={t}
                      onClick={() => patch({ teamSize: t })}
                      style={{
                        padding: "6px 14px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        background: data.teamSize === t ? "#4f46e5" : "var(--color-bg3)",
                        color: data.teamSize === t ? "#fff" : "var(--color-text2)",
                        border: `1.5px solid ${data.teamSize === t ? "#4f46e5" : "var(--color-bg4)"}`,
                        transition: "all 0.15s",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      // STEP 2 — Channels
      case 2:
        return (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text)", margin: "0 0 6px" }}>Which channels will you use?</h3>
              <p style={{ fontSize: 12.5, color: "var(--color-text3)", margin: 0 }}>Select all that apply. You can change this later in Settings.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {CHANNEL_OPTIONS.map((ch) => (
                <OptionCard key={ch.id} {...ch} selected={data.channels.includes(ch.id)} onToggle={() => toggleArr("channels", ch.id)} />
              ))}
            </div>
          </div>
        );

      // STEP 3 — Lead sources
      case 3:
        return (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text)", margin: "0 0 6px" }}>Where should we find leads?</h3>
              <p style={{ fontSize: 12.5, color: "var(--color-text3)", margin: 0 }}>We'll auto-configure the right scrapers for you.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {SOURCE_OPTIONS.map((s) => (
                <OptionCard key={s.id} {...s} selected={data.leadSources.includes(s.id)} onToggle={() => toggleArr("leadSources", s.id)} />
              ))}
            </div>

            <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6366f1", margin: "0 0 8px" }}>Apify API token <span style={{ fontWeight: 400, color: "var(--color-text3)" }}>(optional — add later in Settings)</span></p>
              <input
                style={inputSx}
                type="password"
                placeholder="apify_api_..."
                value={data.apifyToken}
                onChange={(e) => patch({ apifyToken: e.target.value })}
              />
              <p style={{ fontSize: 11, color: "var(--color-text3)", margin: "6px 0 0" }}>
                Get your free token at apify.com → Account → Integrations
              </p>
            </div>
          </div>
        );

      // STEP 4 — Agent + goal
      case 4:
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconUser size={18} style={{ color: "#6366f1" }} />
              </span>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text)", margin: 0 }}>Name your AI agent</h3>
                <p style={{ fontSize: 12, color: "var(--color-text3)", margin: 0 }}>Give it a name that reflects your campaign</p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Agent name</label>
                <input
                  style={inputSx}
                  placeholder={`e.g. ${data.industry || "Sales"} Outreach Agent`}
                  value={data.agentName}
                  onChange={(e) => patch({ agentName: e.target.value })}
                  autoFocus
                />
                <p style={{ fontSize: 11, color: "var(--color-text3)", margin: 0 }}>This is the identity your AI uses when reaching out.</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text2)" }}>Primary goal</label>
                {GOALS.map((g) => (
                  <button
                    key={g}
                    onClick={() => patch({ goal: g })}
                    style={{
                      padding: "10px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                      background: data.goal === g ? "rgba(79,70,229,0.07)" : "var(--color-bg)",
                      border: `1.5px solid ${data.goal === g ? "#4f46e5" : "var(--color-bg4)"}`,
                      fontSize: 13, fontWeight: data.goal === g ? 600 : 400,
                      color: data.goal === g ? "#4f46e5" : "var(--color-text2)",
                      display: "flex", alignItems: "center", gap: 10,
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                      background: data.goal === g ? "#4f46e5" : "transparent",
                      border: `2px solid ${data.goal === g ? "#4f46e5" : "var(--color-bg4)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {data.goal === g && <IconCheck size={9} style={{ color: "#fff" }} />}
                    </div>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      // STEP 5 — Done
      case 5:
        return (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 68, height: 68, borderRadius: "50%",
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 22px",
              boxShadow: "0 8px 24px rgba(79,70,229,0.3)",
            }}>
              <IconConfetti size={32} style={{ color: "#fff" }} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text)", margin: "0 0 10px" }}>
              You&apos;re all set!
            </h2>
            <p style={{ fontSize: 14, color: "var(--color-text3)", lineHeight: 1.7, margin: "0 0 24px" }}>
              Your agent <strong style={{ color: "var(--color-text)" }}>{data.agentName || data.industry + " Agent"}</strong> is ready.
              Go to <strong style={{ color: "var(--color-text)" }}>Settings → Apify Scrapers</strong> to start importing leads, then hit <strong style={{ color: "var(--color-text)" }}>Sync Apify</strong> in the top bar.
            </p>

            {/* Summary chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 28 }}>
              {[
                data.businessType || "Business",
                data.location || "India",
                ...data.channels,
                ...data.leadSources,
              ].filter(Boolean).map((tag) => (
                <span key={tag} style={{
                  padding: "4px 12px", borderRadius: 99, fontSize: 11.5, fontWeight: 600,
                  background: "rgba(99,102,241,0.08)", color: "#6366f1",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}>
                  {tag}
                </span>
              ))}
            </div>

            <button
              onClick={finish}
              disabled={saving}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 12,
                background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                color: "#fff", fontSize: 14, fontWeight: 700,
                border: "none", cursor: saving ? "not-allowed" : "pointer",
                boxShadow: "0 6px 20px rgba(79,70,229,0.3)",
                opacity: saving ? 0.7 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {saving ? "Setting up…" : "Launch dashboard →"}
            </button>
          </div>
        );
    }
  }

  // ── nav logic ───────────────────────────────────────────────────────────────

  function canNext(): boolean {
    if (step === 0) return !!(data.businessName.trim() && data.businessType);
    if (step === 1) return !!(data.industry.trim() && data.location.trim());
    if (step === 2) return data.channels.length > 0;
    if (step === 3) return data.leadSources.length > 0;
    if (step === 4) return !!(data.agentName.trim() && data.goal);
    return true;
  }

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15,23,42,0.6)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 500,
          background: "var(--color-bg2)",
          borderRadius: 24,
          padding: "36px 36px 32px",
          boxShadow: "0 32px 72px rgba(0,0,0,0.18)",
          border: "1px solid var(--color-bg4)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>
              Sales<span style={{ color: "#6366f1" }}>Agent</span>
            </span>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--color-text3)", fontWeight: 600 }}>
            Step {step + 1} of {TOTAL_STEPS}
          </span>
        </div>

        <Dots total={TOTAL_STEPS} current={step} />

        {/* Step content */}
        <div style={{ minHeight: 280 }}>
          {renderStep()}
        </div>

        {/* Navigation */}
        {step < TOTAL_STEPS && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24 }}>
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                style={{
                  padding: "10px 18px", borderRadius: 10, cursor: "pointer",
                  background: "var(--color-bg3)", border: "1px solid var(--color-bg4)",
                  color: "var(--color-text2)", fontSize: 13, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <IconChevronLeft size={15} />
                Back
              </button>
            )}
            {!isLastStep && (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 10, cursor: canNext() ? "pointer" : "not-allowed",
                  background: canNext() ? "linear-gradient(135deg, #4f46e5, #6366f1)" : "var(--color-bg4)",
                  color: canNext() ? "#fff" : "var(--color-text3)",
                  fontSize: 13, fontWeight: 700, border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: canNext() ? "0 4px 14px rgba(79,70,229,0.28)" : "none",
                  transition: "all 0.15s",
                }}
              >
                Continue <IconArrowRight size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

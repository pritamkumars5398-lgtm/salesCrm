"use client";
import { useEffect, useState } from "react";
import { IconDatabase, IconEye, IconEyeOff } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { GENERAL_CARDS, INTEGRATION_CARDS, type SettingsCard } from "@/lib/constants/settings";
import SettingsNavItem from "@/components/settings/SettingsNavItem";
import SettingsToggle from "@/components/settings/SettingsToggle";
import SavedBadge from "@/components/settings/SavedBadge";
import ApifySources from "@/components/pages/ApifySources";

export default function Settings() {
  const { activeAgent, showToast } = useAppStore();
  const [active, setActive] = useState("profile");
  const [values, setValues] = useState<Record<string, string>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/settings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((data) => {
        setValues(data);
        const t: Record<string, boolean> = {};
        INTEGRATION_CARDS.filter((c) => c.togglable).forEach((c) => { t[c.key] = data[`${c.key}Enabled`] !== "false"; });
        setToggles(t);
      });
  }, [activeAgent?._id]);

  async function saveCard(card: SettingsCard) {
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

  const ALL_CARDS = [...GENERAL_CARDS, ...INTEGRATION_CARDS];
  const activeCard = ALL_CARDS.find((c) => c.key === active);
  const isSourcesPage = active === "apify";

  return (
    <div className="flex h-full" style={{ background: "var(--color-bg)" }}>
      {/* Left nav */}
      <div className="flex flex-col gap-1 p-3 shrink-0" style={{ width: 220, borderRight: "1px solid var(--color-bg4)", background: "var(--color-bg2)", paddingTop: 20 }}>
        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1" style={{ color: "var(--color-text3)" }}>General</p>
        {GENERAL_CARDS.map((card) => (
          <SettingsNavItem key={card.key} card={card} active={active} toggles={toggles} onSelect={setActive} />
        ))}

        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1 mt-4" style={{ color: "var(--color-text3)" }}>Integrations</p>
        {INTEGRATION_CARDS.map((card) => (
          <SettingsNavItem key={card.key} card={card} active={active} toggles={toggles} onSelect={setActive} />
        ))}

        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1 mt-4" style={{ color: "var(--color-text3)" }}>Sources</p>
        <button
          onClick={() => setActive("apify")}
          className="flex items-center gap-2.5 w-full text-left transition-all duration-150"
          style={{ padding: "8px 10px", borderRadius: 10, background: active === "apify" ? "rgba(79,70,229,0.08)" : "transparent", border: "none", cursor: "pointer" }}
        >
          <span className="shrink-0 flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 8, background: active === "apify" ? "rgba(99,102,241,0.12)" : "var(--color-bg3)" }}>
            <IconDatabase size={15} style={{ color: active === "apify" ? "#6366f1" : "var(--color-text3)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-none truncate" style={{ color: active === "apify" ? "#4f46e5" : "var(--color-text)" }}>Apify Scrapers</p>
            <p className="text-[10.5px] leading-tight mt-0.5 truncate" style={{ color: "var(--color-text3)" }}>Google Maps, LinkedIn & more</p>
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
                <span className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: activeCard.iconBg }}>
                  <activeCard.Icon size={20} style={{ color: activeCard.iconColor }} />
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold leading-tight" style={{ color: "var(--color-text)" }}>{activeCard.title}</h2>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text3)" }}>{activeCard.description}</p>
                </div>
              </div>
              {activeCard.togglable && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[12px]" style={{ color: "var(--color-text3)" }}>
                    {toggles[activeCard.key] !== false ? "Enabled" : "Disabled"}
                  </span>
                  <SettingsToggle
                    checked={toggles[activeCard.key] !== false}
                    onChange={(v) => setToggles((p) => ({ ...p, [activeCard.key]: v }))}
                  />
                </div>
              )}
            </div>

            <div style={{ height: 1, background: "var(--color-bg4)", marginBottom: 24 }} />

            {/* Fields */}
            <div className="flex flex-col gap-5">
              {activeCard.fields.map((f) => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-semibold" style={{ color: "var(--color-text2)" }}>{f.label}</label>
                    {f.hint && <span className="text-[10.5px]" style={{ color: "var(--color-text3)" }}>{f.hint}</span>}
                  </div>
                  {f.type === "password" ? (
                    <div className="relative w-full flex items-center">
                      <input
                        className="form-input pr-9"
                        type={showPasswords[f.key] ? "text" : "password"}
                        placeholder={f.placeholder}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords((p) => ({ ...p, [f.key]: !p[f.key] }))}
                        className="absolute right-2 p-1 rounded-md transition-colors text-slate-400 hover:text-slate-600 flex items-center justify-center border-none bg-transparent cursor-pointer"
                      >
                        {showPasswords[f.key] ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                      </button>
                    </div>
                  ) : f.options ? (
                    <select
                      className="form-input"
                      value={values[f.key] ?? f.options[0]}
                      onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    >
                      {f.options.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      className="form-input"
                      style={{ minHeight: "100px", padding: "8px 12px", resize: "vertical" }}
                      placeholder={f.placeholder}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className="form-input"
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
                style={{ padding: "8px 20px", borderRadius: 10, background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
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

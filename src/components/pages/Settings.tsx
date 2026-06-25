"use client";
import { useEffect, useState } from "react";
import { IconDatabase, IconEye, IconEyeOff, IconCopy, IconPhone, IconMicrophone, IconPlayerPlay, IconAlertTriangle, IconMessage, IconCheck } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { GENERAL_CARDS, INTEGRATION_CARDS, type SettingsCard } from "@/lib/constants/settings";
import SettingsNavItem from "@/components/settings/SettingsNavItem";
import SettingsToggle from "@/components/settings/SettingsToggle";
import SavedBadge from "@/components/settings/SavedBadge";
import ApifySources from "@/components/pages/ApifySources";

export default function Settings() {
  const { activeAgent, showToast, agents } = useAppStore();
  const [active, setActive] = useState("profile");
  const [values, setValues] = useState<Record<string, string>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [copySourceAgentId, setCopySourceAgentId] = useState("");
  const [playingPreview, setPlayingPreview] = useState(false);
  const [testSmsTo, setTestSmsTo] = useState("");
  const [sendingTestSms, setSendingTestSms] = useState(false);
  const [smsStatusLabel, setSmsStatusLabel] = useState("");
  const [testSmsResult, setTestSmsResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function playVoicePreview() {
    if (!activeAgent || playingPreview) return;
    const greeting = values["callGreeting"] || "";
    if (!greeting.trim()) {
      showToast("Set a Call Opening Greeting first", "error");
      return;
    }
    if (!values["voiceApiKey"]) {
      showToast("Save your Voice API key in settings first", "error");
      return;
    }
    setPlayingPreview(true);
    try {
      const sampleText = greeting.replace(/\{\{leadName\}\}/gi, "Rahul");
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, text: sampleText }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        showToast(error || "Preview failed", "error");
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPlayingPreview(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPlayingPreview(false); showToast("Audio playback failed", "error"); };
      await audio.play();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Preview failed", "error");
      setPlayingPreview(false);
    }
  }

  async function sendTestSms() {
    if (!activeAgent || sendingTestSms) return;
    if (!testSmsTo.trim()) {
      showToast("Enter a phone number to send the test to", "error");
      return;
    }
    setSendingTestSms(true);
    setSmsStatusLabel("Sending…");
    setTestSmsResult(null);
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, to: testSmsTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestSmsResult({ ok: false, msg: data.error || "Send failed" });
        return;
      }

      const provider = data.provider as string;
      const msgId    = (data.uuid || data.sid || data.msgId) as string | undefined;

      // MSG91 has no delivery status API — mark sent immediately
      if (provider === "MSG91" || !msgId) {
        setTestSmsResult({ ok: true, msg: `via ${provider}` });
        return;
      }

      // Poll for delivery confirmation (max 20 × 3 s = 60 s)
      setSmsStatusLabel("Checking delivery…");
      const TERMINAL = new Set(["delivered", "undelivered", "rejected", "failed"]);
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const sr = await fetch(
            `/api/sms/status?agentId=${activeAgent._id}&provider=${encodeURIComponent(provider)}&msgId=${encodeURIComponent(msgId)}`
          );
          const sd = await sr.json();
          const state: string = sd.state || "";
          setSmsStatusLabel(`Carrier status: ${state}…`);

          if (state === "delivered") {
            setTestSmsResult({ ok: true, msg: `via ${provider} · confirmed delivered` });
            return;
          }
          if (state === "undelivered" || state === "rejected" || state === "failed") {
            setTestSmsResult({ ok: false, msg: `Delivery failed (${state}) — check your Plivo/Twilio number registration and DLT setup.` });
            return;
          }
          if (TERMINAL.has(state)) break;
        } catch { /* ignore poll error, keep retrying */ }
      }

      // Timed out — message was accepted but delivery not confirmed
      setTestSmsResult({ ok: false, msg: "Sent to carrier but delivery not confirmed after 60 s. Check your provider dashboard for status." });
    } catch (err: unknown) {
      setTestSmsResult({ ok: false, msg: err instanceof Error ? err.message : "Network error" });
    } finally {
      setSendingTestSms(false);
      setSmsStatusLabel("");
    }
  }

  async function handleCopySettings(type: "current" | "all") {
    if (!activeAgent || !copySourceAgentId) return;
    const sourceAgent = agents.find((a) => a._id === copySourceAgentId);
    if (!sourceAgent) return;

    try {
      const res = await fetch(`/api/settings?agentId=${copySourceAgentId}`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      const sourceData = await res.json() as Record<string, string>;

      if (type === "current") {
        const ALL_CARDS = [...GENERAL_CARDS, ...INTEGRATION_CARDS];
        const activeCard = ALL_CARDS.find((c) => c.key === active);
        if (!activeCard) return;

        const keysToCopy = activeCard.fields.map((f) => f.key);
        const newValues = { ...values };
        const newToggles = { ...toggles };
        
        keysToCopy.forEach((key) => {
          newValues[key] = sourceData[key] ?? "";
        });
        
        if (activeCard.togglable) {
          const enableKey = `${activeCard.key}Enabled`;
          newToggles[activeCard.key] = sourceData[enableKey] !== "false";
        }
        
        setValues(newValues);
        setToggles(newToggles);
        showToast(`Loaded ${activeCard.title} settings from ${sourceAgent.name}. Click 'Save changes' to apply.`);
      } else {
        const confirmCopy = window.confirm(
          `Are you sure you want to copy all integration configurations (AI Brain, WhatsApp, Voice, Email, SMS, Calendly) from ${sourceAgent.name} to ${activeAgent.name}? This will overwrite existing integration settings.`
        );
        if (!confirmCopy) return;

        const integrationKeys: string[] = [];
        INTEGRATION_CARDS.forEach((c) => {
          c.fields.forEach((f) => integrationKeys.push(f.key));
          if (c.togglable) {
            integrationKeys.push(`${c.key}Enabled`);
          }
        });

        const patch: Record<string, string> = {};
        integrationKeys.forEach((key) => {
          if (key in sourceData) {
            patch[key] = sourceData[key];
          }
        });

        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: activeAgent._id, settings: patch }),
        });

        const refreshRes = await fetch(`/api/settings?agentId=${activeAgent._id}`);
        const freshData = await refreshRes.json();
        setValues(freshData);
        const t: Record<string, boolean> = {};
        INTEGRATION_CARDS.filter((c) => c.togglable).forEach((c) => {
          t[c.key] = freshData[`${c.key}Enabled`] !== "false";
        });
        setToggles(t);
        setCopySourceAgentId("");
        showToast(`All integration configurations copied from ${sourceAgent.name}`);
      }
    } catch (err) {
      console.error(err);
      showToast("Error copying settings", "error");
    }
  }

  useEffect(() => {
    if (!activeAgent) return;
    setCopySourceAgentId("");
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
  const isIntegration = INTEGRATION_CARDS.some((c) => c.key === active);

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

            {/* Copy settings utility */}
            {isIntegration && agents.length > 1 && (
              <div className="mb-6 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderColor: "var(--color-bg4)", backgroundColor: "var(--color-bg)" }}>
                <div>
                  <h4 className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>Copy Settings</h4>
                  <p className="text-[11px]" style={{ color: "var(--color-text3)" }}>Use configurations from another agent</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <select
                    className="form-input text-[12px] py-1.5 px-2.5"
                    style={{ width: "160px", height: "34px", background: "var(--color-bg2)" }}
                    value={copySourceAgentId}
                    onChange={(e) => setCopySourceAgentId(e.target.value)}
                  >
                    <option value="">Select agent...</option>
                    {agents.filter((a) => a._id !== activeAgent?._id).map((a) => (
                      <option key={a._id} value={a._id}>{a.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleCopySettings("current")}
                    disabled={!copySourceAgentId}
                    className="flex items-center justify-center text-[12px] font-medium rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    style={{ height: "34px", padding: "0 12px", borderColor: "var(--color-bg4)", borderWidth: 1 }}
                  >
                    This Section
                  </button>
                  <button
                    onClick={() => handleCopySettings("all")}
                    disabled={!copySourceAgentId}
                    className="flex items-center justify-center text-[12px] font-semibold rounded-lg text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ height: "34px", padding: "0 12px", background: "linear-gradient(135deg, #4f46e5, #6366f1)" }}
                  >
                    All Integrations
                  </button>
                </div>
              </div>
            )}

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
                  ) : f.type === "webhook-url" ? (
                    <div className="w-full flex items-start gap-2">
                      <div
                        className="form-input bg-slate-50 dark:bg-slate-900/50 cursor-default flex-1"
                        style={{ height: "auto", minHeight: "38px", wordBreak: "break-all", paddingTop: "8px", paddingBottom: "8px", lineHeight: "1.4" }}
                      >
                        {`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/whatsapp?agentId=${activeAgent?._id || ""}`}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/api/webhooks/whatsapp?agentId=${activeAgent?._id || ""}`;
                          navigator.clipboard.writeText(url);
                          showToast("Webhook URL copied to clipboard!");
                        }}
                        className="shrink-0 flex items-center justify-center rounded-md border transition-colors cursor-pointer text-slate-500 hover:text-slate-700"
                        style={{ width: "38px", height: "38px", borderColor: "var(--color-bg4)", background: "var(--color-bg2)" }}
                        title="Copy to clipboard"
                      >
                        <IconCopy size={16} />
                      </button>
                    </div>
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

            {/* Voice call preview panel */}
            {activeCard.key === "voice" && (
              <div className="mt-8 rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(245,166,35,0.25)", background: "rgba(245,166,35,0.04)" }}>
                {/* Header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b" style={{ borderColor: "rgba(245,166,35,0.15)", background: "rgba(245,166,35,0.06)" }}>
                  <IconPhone size={15} style={{ color: "#f5a623" }} />
                  <span className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>Call Preview</span>
                  <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(245,166,35,0.15)", color: "#f5a623" }}>Simulated</span>
                </div>

                {/* Phone UI mock */}
                <div className="p-5 flex gap-5 items-start">
                  {/* Call bubble */}
                  <div className="flex-1 flex flex-col gap-3">
                    {/* Greeting bubble */}
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(245,166,35,0.15)" }}>
                        <IconMicrophone size={13} style={{ color: "#f5a623" }} />
                      </div>
                      <div className="rounded-2xl rounded-tl-none px-4 py-3 text-[12.5px] max-w-[340px]" style={{ background: "var(--color-bg3)", color: "var(--color-text)", lineHeight: 1.6 }}>
                        {values["callGreeting"]
                          ? values["callGreeting"].replace("{{leadName}}", "Rahul")
                          : <span style={{ color: "var(--color-text3)" }}>Set a Call Opening Greeting above to see a preview here.</span>}
                      </div>
                    </div>

                    {/* Lead response */}
                    <div className="flex items-start gap-2 justify-end">
                      <div className="rounded-2xl rounded-tr-none px-4 py-3 text-[12.5px] max-w-[260px]" style={{ background: "rgba(108,99,255,0.1)", color: "var(--color-text)", lineHeight: 1.6 }}>
                        Yes, speaking. Who is this?
                      </div>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold" style={{ background: "rgba(108,99,255,0.12)", color: "#6366f1" }}>R</div>
                    </div>

                    {/* Agent continues */}
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(245,166,35,0.15)" }}>
                        <IconMicrophone size={13} style={{ color: "#f5a623" }} />
                      </div>
                      <div className="rounded-2xl rounded-tl-none px-4 py-3 text-[12.5px] max-w-[340px]" style={{ background: "var(--color-bg3)", color: "var(--color-text)", lineHeight: 1.6 }}>
                        {values["callScript"]
                          ? values["callScript"].slice(0, 120) + (values["callScript"].length > 120 ? "…" : "")
                          : <span style={{ color: "var(--color-text3)" }}>Add a Call Script above to preview AI behaviour.</span>}
                      </div>
                    </div>
                  </div>

                  {/* Config summary */}
                  <div className="flex-shrink-0 flex flex-col gap-2 text-[11.5px]" style={{ minWidth: 160 }}>
                    {[
                      { label: "Voice", val: values["voiceId"] || values["voiceProvider"] || "—" },
                      { label: "Provider", val: values["callProvider"] || "—" },
                      { label: "Caller", val: values["callerPhone"] || "—" },
                      { label: "Max duration", val: values["callMaxDuration"] ? `${values["callMaxDuration"]} min` : "—" },
                      { label: "Call window", val: (values["callWindowStart"] && values["callWindowEnd"]) ? `${values["callWindowStart"]}:00 – ${values["callWindowEnd"]}:00` : "—" },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <span style={{ color: "var(--color-text3)" }}>{label}</span>
                        <span className="font-medium truncate max-w-[90px]" style={{ color: "var(--color-text2)" }} title={val}>{val}</span>
                      </div>
                    ))}

                    {/* Play demo button */}
                    <button
                      onClick={playVoicePreview}
                      disabled={playingPreview || !values["voiceApiKey"] || !values["callGreeting"]}
                      className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-lg text-[11.5px] font-semibold transition-all"
                      style={{
                        padding: "7px 0",
                        background: playingPreview ? "rgba(34,201,122,0.12)" : "rgba(245,166,35,0.12)",
                        color: playingPreview ? "#22c97a" : (!values["voiceApiKey"] || !values["callGreeting"]) ? "var(--color-text3)" : "#f5a623",
                        border: `1px solid ${playingPreview ? "rgba(34,201,122,0.3)" : "rgba(245,166,35,0.25)"}`,
                        cursor: (playingPreview || !values["voiceApiKey"] || !values["callGreeting"]) ? "not-allowed" : "pointer",
                        opacity: (!values["voiceApiKey"] || !values["callGreeting"]) ? 0.55 : 1,
                      }}
                      title={
                        !values["voiceApiKey"] ? "Add Voice API key and save first"
                        : !values["callGreeting"] ? "Set a Call Opening Greeting first"
                        : "Play greeting audio in your browser"
                      }
                    >
                      {playingPreview ? (
                        <>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px solid #22c97a44", borderTopColor: "#22c97a", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                          Playing…
                        </>
                      ) : (
                        <><IconPlayerPlay size={12} /> Preview greeting</>
                      )}
                    </button>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                </div>

                {/* Edge-case warnings */}
                {(!values["callGreeting"] || !values["callScript"] || !values["callerPhone"]) && (
                  <div className="px-5 pb-4 flex flex-col gap-2">
                    {!values["callerPhone"] && (
                      <div className="flex items-center gap-2 text-[11.5px] px-3 py-2 rounded-lg" style={{ background: "rgba(255,107,107,0.08)", color: "#ff6b6b" }}>
                        <IconAlertTriangle size={13} /> Caller Phone Number is missing — outbound calls will fail.
                      </div>
                    )}
                    {!values["callGreeting"] && (
                      <div className="flex items-center gap-2 text-[11.5px] px-3 py-2 rounded-lg" style={{ background: "rgba(245,166,35,0.08)", color: "#f5a623" }}>
                        <IconAlertTriangle size={13} /> No opening greeting set — the call will start with silence.
                      </div>
                    )}
                    {!values["callScript"] && (
                      <div className="flex items-center gap-2 text-[11.5px] px-3 py-2 rounded-lg" style={{ background: "rgba(245,166,35,0.08)", color: "#f5a623" }}>
                        <IconAlertTriangle size={13} /> No call script — the AI won&apos;t know what to say after the greeting.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SMS test panel */}
            {activeCard.key === "sms" && (
              <div className="mt-8 rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(204,153,255,0.25)", background: "rgba(204,153,255,0.04)" }}>
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b" style={{ borderColor: "rgba(204,153,255,0.15)", background: "rgba(204,153,255,0.06)" }}>
                  <IconMessage size={15} style={{ color: "#cc99ff" }} />
                  <span className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>Send a Test SMS</span>
                  <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(204,153,255,0.15)", color: "#cc99ff" }}>Live</span>
                </div>
                <div className="p-5 flex flex-col gap-3">
                  <p className="text-[12px]" style={{ color: "var(--color-text3)" }}>
                    Sends a real test message to verify your credentials. Save settings first.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={testSmsTo}
                      onChange={(e) => { setTestSmsTo(e.target.value); setTestSmsResult(null); }}
                      placeholder="+91xxxxxxxxxx"
                      className="flex-1 text-[13px] rounded-lg px-3 py-2 outline-none"
                      style={{ background: "var(--color-bg3)", border: "1px solid var(--color-bg4)", color: "var(--color-text)" }}
                    />
                    <button
                      onClick={sendTestSms}
                      disabled={sendingTestSms || !values["smsApiKey"]}
                      className="flex items-center gap-1.5 rounded-lg text-[12px] font-semibold transition-all"
                      style={{
                        padding: "8px 16px",
                        background: sendingTestSms ? "rgba(204,153,255,0.08)" : "rgba(204,153,255,0.15)",
                        color: !values["smsApiKey"] ? "var(--color-text3)" : "#cc99ff",
                        border: "1px solid rgba(204,153,255,0.3)",
                        cursor: (sendingTestSms || !values["smsApiKey"]) ? "not-allowed" : "pointer",
                        opacity: !values["smsApiKey"] ? 0.55 : 1,
                        whiteSpace: "nowrap",
                      }}
                      title={!values["smsApiKey"] ? "Save your API key first" : "Send test SMS"}
                    >
                      {sendingTestSms ? (
                        <><span style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px solid #cc99ff44", borderTopColor: "#cc99ff", display: "inline-block", animation: "spin 0.8s linear infinite" }} /> {smsStatusLabel || "Sending…"}</>
                      ) : (
                        <><IconMessage size={13} /> Send Test</>
                      )}
                    </button>
                  </div>
                  {testSmsResult && (
                    testSmsResult.ok ? (
                      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(34,201,122,0.25)" }}>
                        {/* Success header */}
                        <div className="flex items-center gap-2 px-4 py-3" style={{ background: "rgba(34,201,122,0.12)" }}>
                          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#22c97a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <IconCheck size={13} style={{ color: "#fff" }} />
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#22c97a" }}>SMS sent successfully!</span>
                        </div>
                        {/* Message bubble preview */}
                        <div className="px-4 py-3" style={{ background: "var(--color-bg3)" }}>
                          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text3)", marginBottom: 8 }}>
                            Delivered to {testSmsTo}
                          </p>
                          <div style={{ background: "var(--color-bg4)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, color: "var(--color-text)", lineHeight: 1.6 }}>
                            SalesAgent test: Your SMS integration is working!
                          </div>
                          <p style={{ fontSize: 11, color: "var(--color-text3)", marginTop: 8 }}>
                            {testSmsResult.msg}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-[12px] px-3 py-2.5 rounded-lg" style={{ background: "rgba(255,107,107,0.08)", color: "#ff6b6b" }}>
                        <IconAlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{testSmsResult.msg}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

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

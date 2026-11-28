"use client";
import { useEffect, useState, Fragment } from "react";
import { IconDatabase, IconEye, IconEyeOff, IconCopy, IconPhone, IconMicrophone, IconPlayerPlay, IconAlertTriangle, IconMessage, IconCheck, IconTrash, IconBrain, IconMail, IconBrandWhatsapp, IconCalendar, IconSparkles } from "@tabler/icons-react";
import ChannelsStatusPanel from "@/components/settings/ChannelsStatusPanel";
import { useAppStore } from "@/store/useAppStore";
import { GENERAL_CARDS, INTEGRATION_CARDS, WORKSPACE_CARDS, CUSTOMER_CARDS, CUSTOMER_TAB_ALIASES, type SettingsCard } from "@/lib/constants/settings";
import BusinessSetupPanel from "@/components/settings/BusinessSetupPanel";
import LeadsSetupPanel from "@/components/settings/LeadsSetupPanel";
import { GEMINI_VOICES } from "@/lib/constants/gemini-voices";
import LeadFieldsPanel from "@/components/settings/LeadFieldsPanel";
import LeadGroupsPanel from "@/components/settings/LeadGroupsPanel";
import KnowledgePanel from "@/components/settings/KnowledgePanel";
import TeamPanel from "@/components/settings/TeamPanel";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import SettingsNavItem from "@/components/settings/SettingsNavItem";
import SettingsToggle from "@/components/settings/SettingsToggle";
import SavedBadge from "@/components/settings/SavedBadge";
import ApifySources from "@/components/pages/ApifySources";
import LlmSources from "@/components/pages/LlmSources";
import { useRouter, useSearchParams } from "next/navigation";
import ElevenLabsSetupPanel from "@/components/settings/ElevenLabsSetupPanel";
import ElevenLabsVoiceStudio from "@/components/settings/ElevenLabsVoiceStudio";
import GeminiVoiceStudio from "@/components/settings/GeminiVoiceStudio";

export default function Settings() {
  const { activeAgent, showToast, agents, updateAgent, isSuperadmin } = useAppStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState("business");
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
  const [testSentence, setTestSentence] = useState("Hi, welcome to SalesAgent! I am Priya, your AI sales assistant. How can I help you automate your cold outreach and manage your CRM leads today?");
  const [testVoice, setTestVoice] = useState("Aoede");
  const [playingTest, setPlayingTest] = useState(false);
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [callingReal, setCallingReal] = useState(false);
  const [checkingSms, setCheckingSms] = useState(false);
  const [lastReceivedSms, setLastReceivedSms] = useState<{ text: string, timestamp: string, senderName: string, senderPhone: string } | null>(null);
  const [checkingWa, setCheckingWa] = useState(false);
  const [lastReceivedWa, setLastReceivedWa] = useState<{ text: string, timestamp: string, senderName: string, senderPhone: string } | null>(null);
  const [testWaTo, setTestWaTo] = useState("");
  const [sendingTestWa, setSendingTestWa] = useState(false);
  const [waStatusLabel, setWaStatusLabel] = useState("Sending…");
  const [testWaResult, setTestWaResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActive(CUSTOMER_TAB_ALIASES[tab] ?? tab);
    }
  }, [searchParams]);

  const handleTabChange = (tabKey: string) => {
    setActive(tabKey);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tabKey);
    params.delete("channel"); // a menu click always opens the page itself, not a card inside it
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  };

  async function playVoicePreview() {
    if (!activeAgent || playingPreview) return;
    const greeting = values["callGreeting"] || "";
    if (!greeting.trim()) {
      showToast("Set a Call Opening Greeting first", "error");
      return;
    }
    const currentVoiceProvider = values["voiceProvider"] || "Google Gemini";
    if (currentVoiceProvider === "ElevenLabs" && !values["voiceApiKey"]) {
      showToast("Save your ElevenLabs Voice API key in settings first", "error");
      return;
    }
    setPlayingPreview(true);
    try {
      const sampleText = greeting.replace(/\{\{leadName\}\}/gi, "Rahul");
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeAgent._id,
          text: sampleText,
          voiceProvider: currentVoiceProvider,
          voiceId: values["voiceId"] || (currentVoiceProvider === "Google Gemini" ? "Puck" : "ch9J8IB6HKlEHQaWQFdk"),
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        showToast(error || "Preview failed", "error");
        setPlayingPreview(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPlayingPreview(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setPlayingPreview(false); showToast("Audio playback failed", "error"); };
      try {
        await audio.play();
      } catch (playErr: any) {
        URL.revokeObjectURL(url);
        setPlayingPreview(false);
        if (playErr.name === "NotAllowedError") {
          showToast("Audio blocked: Click/interact with the page first to allow audio playback.", "error");
        } else {
          showToast(`Playback error: ${playErr.message}`, "error");
        }
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Preview failed", "error");
      setPlayingPreview(false);
    }
  }

  async function playTestSentence() {
    if (!testSentence.trim() || playingTest) return;

    const currentVoiceProvider = values["voiceProvider"] || "Google Gemini";
    if (currentVoiceProvider === "ElevenLabs" && !values["voiceApiKey"]) {
      showToast("Save your ElevenLabs Voice API key in settings first", "error");
      return;
    }

    setPlayingTest(true);
    try {
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeAgent?._id,
          text: testSentence,
          voiceProvider: currentVoiceProvider,
          voiceId: testVoice || (currentVoiceProvider === "Google Gemini" ? "Puck" : "ch9J8IB6HKlEHQaWQFdk"),
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); setPlayingTest(false); };
        audio.onerror = () => { URL.revokeObjectURL(url); setPlayingTest(false); showToast("Audio playback failed", "error"); };
        try {
          await audio.play();
        } catch (playErr: any) {
          URL.revokeObjectURL(url);
          setPlayingTest(false);
          if (playErr.name === "NotAllowedError") {
            showToast("Audio blocked: Click/interact with the page first to allow audio playback.", "error");
          } else {
            showToast(`Playback error: ${playErr.message}`, "error");
          }
        }
      } else {
        const { error } = await res.json().catch(() => ({ error: "" }));
        showToast(error || "Voice testing failed", "error");
        setPlayingTest(false);
      }
    } catch (err: any) {
      showToast(err.message || "Voice testing failed", "error");
      setPlayingTest(false);
    }
  }

  async function triggerRealTestCall() {
    if (!testPhoneNumber.trim() || callingReal) return;
    const provider = values["callProvider"] || "Plivo";

    if (provider === "Vapi.ai") {
      if (!values["callApiKey"]) {
        showToast("Vapi Call API Key is missing in settings", "error");
        return;
      }
      if (!values["callerPhone"]) {
        showToast("Caller Phone Number (Vapi Phone ID) is missing", "error");
        return;
      }
    } else if (provider === "Plivo") {
      // Plivo uses plivoAuthId & plivoAuthToken, with system .env fallbacks
      const caller = values["callerPhone"] || "918065535939";
      if (!caller) {
        showToast("Caller Phone Number (Outbound DID) is required", "error");
        return;
      }
    }

    setCallingReal(true);
    try {
      const res = await fetch("/api/voice/call-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeAgent?._id,
          testNumber: testPhoneNumber.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start call");
      }
      showToast("Test call triggered successfully! Dialing now...", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to trigger test call", "error");
    } finally {
      setCallingReal(false);
    }
  }

  async function checkReceivedSms() {
    if (!activeAgent) return;
    setCheckingSms(true);
    setLastReceivedSms(null);
    try {
      const res = await fetch(`/api/sms/test?agentId=${activeAgent._id}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to fetch last SMS", "error");
      } else if (!data.message) {
        showToast("No incoming SMS messages found yet.", "success");
      } else {
        setLastReceivedSms(data.message);
        showToast("Fetched latest SMS successfully", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to check SMS", "error");
    } finally {
      setCheckingSms(false);
    }
  }

  async function checkReceivedWa() {
    if (!activeAgent) return;
    setCheckingWa(true);
    setLastReceivedWa(null);
    try {
      const res = await fetch(`/api/whatsapp/test?agentId=${activeAgent._id}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Failed to fetch last WhatsApp message", "error");
      } else if (!data.message) {
        showToast("No incoming WhatsApp messages found yet.", "success");
      } else {
        setLastReceivedWa(data.message);
        showToast("Fetched latest WhatsApp message successfully", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to check WhatsApp message", "error");
    } finally {
      setCheckingWa(false);
    }
  }

  async function sendTestWa() {
    if (!activeAgent || sendingTestWa) return;
    if (!testWaTo.trim()) {
      showToast("Enter a phone number to send the test to", "error");
      return;
    }
    setSendingTestWa(true);
    setWaStatusLabel("Sending…");
    setTestWaResult(null);
    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: activeAgent._id, to: testWaTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestWaResult({ ok: false, msg: data.error || "Send failed" });
        return;
      }
      setTestWaResult({ ok: true, msg: data.msg || "Message sent successfully" });
    } catch (err: any) {
      setTestWaResult({ ok: false, msg: err.message || "Failed to send WhatsApp message" });
    } finally {
      setSendingTestWa(false);
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
      const msgId = (data.uuid || data.sid || data.msgId) as string | undefined;

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

  // Reload the form when the AI assistant changes settings, so a later Save
  // doesn't write stale values over what it just set.
  const [settingsReload, setSettingsReload] = useState(0);
  useEffect(() => {
    const onChange = (e: Event) => {
      const changes = (e as CustomEvent<{ changes?: string[] }>).detail?.changes ?? [];
      if (changes.includes("settings")) setSettingsReload((n) => n + 1);
    };
    window.addEventListener("crm:data-changed", onChange);
    return () => window.removeEventListener("crm:data-changed", onChange);
  }, []);

  useEffect(() => {
    if (!activeAgent) return;
    setCopySourceAgentId("");
    fetch(`/api/settings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((data) => {
        setValues({ ...data, agentName: activeAgent.name });
        if (data.voiceId) setTestVoice(data.voiceId);
        const t: Record<string, boolean> = {};
        INTEGRATION_CARDS.filter((c) => c.togglable).forEach((c) => { t[c.key] = data[`${c.key}Enabled`] !== "false"; });
        setToggles(t);
      });
  }, [activeAgent?._id, settingsReload]);

  async function saveCard(card: SettingsCard) {
    if (!activeAgent) return;
    const patch: Record<string, string> = {};
    card.fields.forEach((f) => { patch[f.key] = values[f.key] ?? ""; });
    if (card.togglable) patch[`${card.key}Enabled`] = String(toggles[card.key] ?? true);
    if (card.key === "profile") {
      patch["leadLocations"] = values["leadLocations"] ?? "";
      if (patch.agentName && patch.agentName !== activeAgent.name) {
        const res = await fetch(`/api/agents/${activeAgent._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: patch.agentName }),
        }).catch(() => null);
        if (res?.ok) {
          updateAgent(activeAgent._id, { name: patch.agentName.trim() });
        } else {
          const { error } = res ? await res.json().catch(() => ({ error: "" })) : { error: "" };
          showToast(error || "Could not rename the workspace", "error");
          return;
        }
      }
    }
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: activeAgent._id, settings: patch }),
    }).catch(() => null);
    if (!res?.ok) {
      const { error } = res ? await res.json().catch(() => ({ error: "" })) : { error: "" };
      showToast(error || "Could not save settings", "error");
      return;
    }
    setSaved((p) => ({ ...p, [card.key]: true }));
    setTimeout(() => setSaved((p) => ({ ...p, [card.key]: false })), 2500);
    showToast(`${card.title} settings saved`);
  }

  const customerTab = CUSTOMER_TAB_ALIASES[active] ?? active;
  const isRoleMember = activeAgent?.role === "member";
  const isBasicEditableTab = customerTab === "business";
  const readOnly = isRoleMember && !isBasicEditableTab;
  const isChannelsActive = customerTab === "channels";

  return (
    <div className="flex h-full" style={{ background: "var(--color-bg)" }}>
      {/* Left nav */}
      <div className="flex flex-col gap-1 p-3 shrink-0 overflow-y-auto" style={{ width: 220, borderRight: "1px solid var(--color-bg4)", background: "var(--color-bg2)", paddingTop: 20 }}>
        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1" style={{ color: "var(--color-text3)" }}>Setup</p>
        {CUSTOMER_CARDS.map((card) => (
          <SettingsNavItem key={card.key} card={card} active={customerTab} toggles={toggles} onSelect={handleTabChange} />
        ))}

        <p className="text-[10.5px] font-semibold uppercase tracking-widest px-2 mb-1 mt-4" style={{ color: "var(--color-text3)" }}>Channels</p>
        <button
          type="button"
          onClick={() => handleTabChange("channels")}
          className="flex items-center gap-2.5 w-full text-left transition-all duration-150"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: isChannelsActive ? "rgba(223,42,42,0.08)" : "transparent",
            border: "none",
            cursor: "pointer",
            marginBottom: "4px"
          }}
        >
          <span className="shrink-0 flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 8, background: isChannelsActive ? "rgba(223,42,42,0.12)" : "var(--color-bg3)" }}>
            <IconPhone size={15} style={{ color: isChannelsActive ? "#df2a2a" : "var(--color-text3)" }} />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold leading-none truncate" style={{ color: isChannelsActive ? "#df2a2a" : "var(--color-text)" }}>Channels & status</p>
            <p className="text-[10.5px] leading-tight mt-0.5 truncate" style={{ color: "var(--color-text3)" }}>Active channels & live preview</p>
          </div>
        </button>

        {isSuperadmin && (
          <div className="mt-auto pt-4 border-t border-bg4">
            <button
              type="button"
              onClick={() => router.push("/admin/clients")}
              className="flex items-center gap-2 w-full p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 text-left transition cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-red-400">Admin Portal</p>
                <p className="text-[10px] text-text3 truncate">Configure client keys & platform</p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto w-full" style={{ width: "100%", padding: "2rem 2.5rem 5rem" }}>
        <div className="w-full max-w-[1400px] mx-auto">
          {customerTab === "business" ? (
            <BusinessSetupPanel key={activeAgent?._id} readOnly={false} onOpenTab={handleTabChange} />
          ) : customerTab === "leads" ? (
            <LeadsSetupPanel key={`${activeAgent?._id}-${active}`} readOnly={readOnly} initialTab={active === "groups" ? "groups" : "fields"} />
          ) : customerTab === "knowledge" ? (
            <KnowledgePanel readOnly={readOnly} />
          ) : customerTab === "team" ? (
            <TeamPanel />
          ) : (
            <ChannelsStatusPanel />
          )}
        </div>
      </div>
    </div>
  );
}

function LocationAdder({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        className="form-input text-[12px] flex-1"
        style={{ height: 34 }}
        placeholder="e.g. Lucknow, Mumbai, USA..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd(name);
            setName("");
          }
        }}
      />
      <button
        type="button"
        onClick={() => {
          onAdd(name);
          setName("");
        }}
        className="px-3 rounded-lg text-[12px] font-semibold text-white cursor-pointer bg-gradient-to-br from-indigo-600 to-indigo-500 transition-all border-none flex items-center justify-center shrink-0"
        style={{ height: 34 }}
      >
        Add
      </button>
    </div>
  );
}

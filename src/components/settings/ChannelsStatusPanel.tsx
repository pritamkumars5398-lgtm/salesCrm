"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconBrain, IconPhone, IconBrandWhatsapp, IconMail, IconMessage, IconCalendar, IconDatabase,
  IconRefresh, IconPlayerPlay, IconMicrophone, IconSend, IconExternalLink, IconCircleCheck,
  IconCircleDashed, IconAlertTriangle, IconPlayerPause, IconChevronLeft, IconChevronRight,
  IconClock,
} from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import PracticeCallModal from "@/components/voice/PracticeCallModal";
import { useAppStore } from "@/store/useAppStore";

type ChannelState = "active" | "off" | "not_set_up" | "needs_attention" | "coming_soon";

interface ChannelStatus {
  key: "ai" | "calls" | "voice" | "whatsapp" | "email" | "sms" | "calendly" | "leadSources";
  title: string;
  purpose: string;
  state: ChannelState;
  message: string;
  details: { label: string; value: string }[];
  test?: "call" | "voice" | "email" | "sms" | "whatsapp" | "link";
}

const ICONS: Record<ChannelStatus["key"], { Icon: React.ElementType; color: string }> = {
  ai: { Icon: IconBrain, color: "#8b5cf6" },
  calls: { Icon: IconPhone, color: "#f5a623" },
  voice: { Icon: IconMicrophone, color: "#ec4899" },
  whatsapp: { Icon: IconBrandWhatsapp, color: "#22c97a" },
  email: { Icon: IconMail, color: "#4dabf7" },
  sms: { Icon: IconMessage, color: "#cc99ff" },
  calendly: { Icon: IconCalendar, color: "#006ff3" },
  leadSources: { Icon: IconDatabase, color: "#df2a2a" },
};

const STATE_STYLE: Record<ChannelState, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  active: { label: "Configured · Active", color: "#10b981", bg: "rgba(16,185,129,0.12)", Icon: IconCircleCheck },
  off: { label: "Configured · Off", color: "#6366f1", bg: "rgba(99,102,241,0.12)", Icon: IconPlayerPause },
  not_set_up: { label: "Not set up yet", color: "var(--color-text3)", bg: "var(--color-bg3)", Icon: IconCircleDashed },
  needs_attention: { label: "Needs attention", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", Icon: IconAlertTriangle },
  coming_soon: { label: "Coming soon", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", Icon: IconClock },
};

/**
 * What a customer sees for every channel: whether the admin has set it up and
 * whether it is on — plus tests that need no keys. Never shows providers,
 * models or keys (the server never sends them).
 */
/** One short line per channel for the overview grid. */
const SHORT: Record<ChannelStatus["key"], string> = {
  ai: "Writes and replies for you",
  calls: "Your AI agent's phone line",
  voice: "How your agent sounds",
  whatsapp: "Chat with leads on WhatsApp",
  email: "Outreach and reply emails",
  sms: "Text messages to leads",
  calendly: "Leads book meetings with you",
  leadSources: "Finds new leads for you",
};

/** What the open page lets the customer do, shown on the small card. */
const ACTION: Partial<Record<NonNullable<ChannelStatus["test"]>, string>> = {
  call: "Test call",
  voice: "Voices & language",
  email: "Send a test",
  sms: "Send a test",
  whatsapp: "Send a test",
  link: "Booking link",
};

export default function ChannelsStatusPanel() {
  const { activeAgent, showToast } = useAppStore();
  const agentId = activeAgent?._id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const openKey = searchParams.get("channel");
  const [channels, setChannels] = useState<ChannelStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [brand, setBrand] = useState<{ persona: string; brand: string }>({ persona: "", brand: "" });

  const load = useCallback(async (fresh = false) => {
    if (!agentId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/channels?agentId=${agentId}${fresh ? "&fresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load the status.");
      setChannels(data.channels);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the status.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    setChannels(null);
    load();
    if (!agentId) return;
    fetch(`/api/settings?agentId=${agentId}`)
      .then((r) => r.json())
      .then((s) => setBrand({ persona: s?.aiPersonaName || "", brand: s?.brandName || "" }))
      .catch(() => {});
  }, [agentId, load]);

  // The open channel lives in the URL (?channel=voice), so the browser's Back button returns to the grid.
  const open = (key: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (key) params.set("channel", key);
    else params.delete("channel");
    router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  };

  const activeCount = channels?.filter((c) => c.state === "active").length ?? 0;
  const opened = channels?.find((c) => c.key === openKey);

  if (opened) {
    return (
      <div className="flex flex-col gap-5 w-full max-w-[900px] mx-auto">
        <button
          type="button"
          onClick={() => open(null)}
          className="self-start flex items-center gap-1 text-[13px] font-semibold text-text2 bg-transparent border-none p-0 cursor-pointer"
        >
          <IconChevronLeft size={16} /> All channels
        </button>
        <ChannelPage channel={opened} agentId={agentId!} persona={brand.persona} brandName={brand.brand} onToast={showToast} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1100px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-bg4">
        <div>
          <h2 className="text-[20px] font-bold text-text m-0">Channels & status</h2>
          <p className="text-[13px] text-text3 mt-1 m-0 max-w-[640px]">
            Your admin sets these up for you. Tap a card to see more and try it out.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {channels && (
            <span className="text-[12px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
              {activeCount} of {channels.length} active
            </span>
          )}
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-bg3 border border-bg4 text-text2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <IconRefresh size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Checking…" : "Check again"}
          </button>
        </div>
      </div>

      {error && <p className="text-[13px] m-0" style={{ color: "#ef4444" }}>{error}</p>}
      {!channels && !error && <p className="text-[13px] text-text3 m-0">Checking your channels…</p>}

      {channels && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {channels.map((c) => <SummaryCard key={c.key} channel={c} onOpen={() => open(c.key)} />)}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ channel: c, onOpen }: { channel: ChannelStatus; onOpen: () => void }) {
  const { Icon, color } = ICONS[c.key];
  const st = STATE_STYLE[c.state];
  const action = c.test && (c.state === "active" || c.state === "off") ? ACTION[c.test] : null;
  const soon = c.state === "coming_soon";
  return (
    <button
      type="button"
      onClick={soon ? undefined : onOpen}
      disabled={soon}
      className={`group text-left rounded-2xl border border-bg4 bg-bg2 p-4 flex flex-col gap-3 transition-colors ${soon ? "opacity-70 cursor-default" : "cursor-pointer hover:border-text3"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}22`, color }}>
          <Icon size={20} />
        </div>
        <span className="flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: st.bg, color: st.color }}>
          <st.Icon size={11} /> {c.state === "active" ? "Active" : st.label}
        </span>
      </div>
      <div>
        <h3 className="text-[14.5px] font-bold text-text m-0">{c.title}</h3>
        <p className="text-[12px] text-text3 m-0 mt-0.5">{SHORT[c.key]}</p>
      </div>
      <div className="mt-auto flex items-center justify-between text-[12px] font-semibold text-text2">
        <span>{soon ? "We'll let you know when it's ready" : action ?? "Details"}</span>
        {!soon && <IconChevronRight size={15} className="text-text3 transition-transform group-hover:translate-x-0.5" />}
      </div>
    </button>
  );
}

function ChannelPage({ channel: c, agentId, persona, brandName, onToast }: {
  channel: ChannelStatus;
  agentId: string;
  persona: string;
  brandName: string;
  onToast: (msg: string, type?: "success" | "error") => void;
}) {
  const { Icon, color } = ICONS[c.key];
  const st = STATE_STYLE[c.state];
  const ready = c.state === "active" || c.state === "off";

  return (
    <div className="rounded-2xl border p-6 bg-bg2 border-bg4 flex flex-col gap-4">
      <div className="flex items-start gap-3.5">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}22`, color }}>
          <Icon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
            <h2 className="text-[18px] font-bold text-text m-0">{c.title}</h2>
            <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
              <st.Icon size={12} /> {st.label}
            </span>
          </div>
          <p className="text-[13px] text-text3 m-0 leading-relaxed">{c.purpose}</p>
          {c.state !== "active" && <p className="text-[12.5px] m-0 mt-1.5" style={{ color: st.color }}>{c.message}</p>}
        </div>
      </div>

      {c.details.length > 0 && (
        <div className="flex flex-col gap-1 text-[12.5px] bg-bg3/60 border border-bg4 rounded-lg px-3 py-2">
          {c.details.map((d) => (
            <div key={d.label} className="flex justify-between gap-3">
              <span className="text-text3">{d.label}</span>
              <span className="font-semibold text-text2 truncate">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {ready && c.test === "call" && <CallTest agentId={agentId} brandName={brandName} onToast={onToast} />}
      {ready && c.test === "voice" && <VoicePicker agentId={agentId} persona={persona} brandName={brandName} onToast={onToast} />}
      {ready && (c.test === "sms" || c.test === "whatsapp") && <PhoneTest agentId={agentId} channel={c.test} onToast={onToast} />}
      {ready && c.test === "email" && <EmailTest agentId={agentId} onToast={onToast} />}
      {ready && c.test === "link" && c.details[0]?.value && (
        <a
          href={c.details[0].value}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-bold bg-bg3 border border-bg4 text-text no-underline"
        >
          <IconExternalLink size={14} /> Open booking page
        </a>
      )}
      {!ready && <p className="text-[12.5px] text-text3 m-0">Nothing to try yet — this opens up once your admin finishes setting it up.</p>}
    </div>
  );
}

async function runTest(agentId: string, channel: string, to?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/channels/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, channel, to }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, message: data.message || "Sent." } : { ok: false, message: data.error || "The test failed." };
  } catch {
    return { ok: false, message: "Couldn't reach the server." };
  }
}

function Result({ r }: { r: { ok: boolean; message: string } | null }) {
  if (!r) return null;
  return <p className="text-[12px] m-0" style={{ color: r.ok ? "#10b981" : "#ef4444" }}>{r.message}</p>;
}

function PhoneTest({ agentId, channel, onToast }: { agentId: string; channel: "sms" | "whatsapp"; onToast: (m: string, t?: "success" | "error") => void }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col gap-1.5 pt-3 border-t border-bg4">
      <span className="text-[12px] text-text3">Send a test {channel === "sms" ? "SMS" : "WhatsApp message"} to your own phone:</span>
      <div className="flex items-center gap-2">
        <input type="tel" className="form-input text-[12.5px] py-1.5 px-3 flex-1 min-w-0" placeholder="+91 98765 43210" value={to} onChange={(e) => setTo(e.target.value)} />
        <button
          type="button"
          disabled={busy || !to.trim()}
          onClick={async () => {
            setBusy(true);
            const r = await runTest(agentId, channel, to);
            setResult(r);
            onToast(r.message, r.ok ? "success" : "error");
            setBusy(false);
          }}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold text-white bg-emerald-600 cursor-pointer disabled:opacity-50 border-none"
        >
          <IconSend size={14} /> {busy ? "Sending…" : "Send test"}
        </button>
      </div>
      <Result r={result} />
    </div>
  );
}

function EmailTest({ agentId, onToast }: { agentId: string; onToast: (m: string, t?: "success" | "error") => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col gap-1.5 pt-3 border-t border-bg4">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await runTest(agentId, "email");
          setResult(r);
          onToast(r.message, r.ok ? "success" : "error");
          setBusy(false);
        }}
        className="self-start flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-bold text-white bg-blue-600 cursor-pointer disabled:opacity-50 border-none"
      >
        <IconSend size={14} /> {busy ? "Sending…" : "Send me a test email"}
      </button>
      <Result r={result} />
    </div>
  );
}

function CallTest({ agentId, brandName, onToast }: { agentId: string; brandName: string; onToast: (m: string, t?: "success" | "error") => void }) {
  const [practice, setPractice] = useState(false);
  const [to, setTo] = useState("");
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col gap-1.5 pt-3 border-t border-bg4">
      <span className="text-[12px] text-text3">Get a real test call from your AI agent on your phone:</span>
      <div className="flex items-center gap-2">
        <input type="tel" className="form-input text-[12.5px] py-1.5 px-3 flex-1 min-w-0" placeholder="+91 98765 43210" value={to} onChange={(e) => setTo(e.target.value)} />
        <button
          type="button"
          disabled={calling || !to.trim()}
          onClick={async () => {
            setCalling(true);
            const r = await runTest(agentId, "voice", to);
            setResult(r);
            onToast(r.message, r.ok ? "success" : "error");
            setCalling(false);
          }}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold text-white bg-emerald-600 cursor-pointer disabled:opacity-50 border-none"
        >
          <IconPhone size={14} /> {calling ? "Dialing…" : "Call my phone"}
        </button>
      </div>
      <Result r={result} />
      <button
        type="button"
        onClick={() => setPractice(true)}
        className="self-start mt-1 flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12.5px] font-bold bg-bg3 border border-bg4 text-text cursor-pointer"
      >
        <IconMicrophone size={15} className="text-emerald-500" /> Or practise a call in the browser
      </button>
      {practice && <PracticeCallModal leadId={null} leadName={brandName || "Sample lead"} onClose={() => setPractice(false)} />}
    </div>
  );
}

interface VoiceOption { id: string; name: string; gender?: "female" | "male"; desc?: string }

function VoicePicker({ agentId, persona, brandName, onToast }: { agentId: string; persona: string; brandName: string; onToast: (m: string, t?: "success" | "error") => void }) {
  const [current, setCurrent] = useState<VoiceOption | null>(null);
  const [options, setOptions] = useState<VoiceOption[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [language, setLanguage] = useState("English");
  const [languages, setLanguages] = useState<string[]>([]);
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [greeting, setGreeting] = useState<{ custom: string; suggested: string; sampleCompany: string } | null>(null);
  const [editingGreeting, setEditingGreeting] = useState(false);
  const [greetingDraft, setGreetingDraft] = useState("");
  const [savingGreeting, setSavingGreeting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadVoices = useCallback(() => {
    fetch(`/api/channels/voices?agentId=${agentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.current) return;
        setCurrent(d.current);
        setOptions(d.options ?? []);
        if (d.language) setLanguage(d.language);
        if (Array.isArray(d.languages)) setLanguages(d.languages);
        if (d.greeting) setGreeting(d.greeting);
      })
      .catch(() => {});
  }, [agentId]);

  useEffect(() => {
    loadVoices();
    return () => audioRef.current?.pause();
  }, [loadVoices]);

  /** Play any text in the voice now in use. */
  async function speak(key: string, text: string) {
    audioRef.current?.pause();
    if (playingId === key) { setPlayingId(null); return; }
    setPlayingId(key);
    try {
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, text }),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId((p) => (p === key ? null : p)); URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      setPlayingId(null);
      onToast("Couldn't play this right now. Your admin can check it.", "error");
    }
  }

  async function saveGreeting(text: string) {
    setSavingGreeting(true);
    try {
      const res = await fetch("/api/channels/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, greeting: text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save the opening.");
      setGreeting(d.greeting);
      setEditingGreeting(false);
      onToast(text ? "Your opening line is saved" : "Back to the suggested opening");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't save the opening.", "error");
    } finally {
      setSavingGreeting(false);
    }
  }

  async function listen(v: VoiceOption) {
    audioRef.current?.pause();
    if (playingId === v.id) { setPlayingId(null); return; }
    setPlayingId(v.id);
    try {
      const who = persona || "your AI assistant";
      const text = language === "Hindi"
        ? `नमस्ते! मैं ${persona || "आपकी AI सहायक"}${brandName ? `, ${brandName} से` : ""}। क्या अभी एक मिनट बात हो सकती है?`
        : language === "Hinglish"
          ? `Hello! Main ${who}${brandName ? `, ${brandName} se` : ""}. Kya abhi ek minute baat ho sakti hai?`
          : `Hello! I'm ${who}${brandName ? ` from ${brandName}` : ""}. Is this a good time to talk for a minute?`;
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, text, voiceId: v.id }),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingId((p) => (p === v.id ? null : p)); URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      setPlayingId(null);
      onToast("Couldn't play this voice right now. Your admin can check it.", "error");
    }
  }

  async function choose(v: VoiceOption) {
    setSwitching(v.id);
    try {
      const res = await fetch("/api/channels/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, voiceId: v.id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't switch the voice.");
      setCurrent(d.current ?? v);
      onToast(`Your AI agent now speaks with ${v.name}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't switch the voice.", "error");
    } finally {
      setSwitching(null);
    }
  }

  async function chooseLanguage(lang: string) {
    const before = language;
    setLanguage(lang);
    try {
      const res = await fetch("/api/channels/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, language: lang }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't change the language.");
      onToast(`Your AI agent now speaks ${lang} on calls`);
      loadVoices(); // the suggested opening follows the language
    } catch (err) {
      setLanguage(before);
      onToast(err instanceof Error ? err.message : "Couldn't change the language.", "error");
    }
  }

  if (!current) return null;
  const hasGenders = options.some((o) => o.gender === "female") && options.some((o) => o.gender === "male");
  const shown = options.filter((o) => gender === "all" || o.gender === gender || o.id === current.id);
  const pill = (active: boolean): React.CSSProperties => ({
    background: active ? "#ec4899" : "var(--color-bg3)",
    color: active ? "#fff" : "var(--color-text2)",
    borderColor: active ? "#ec4899" : "var(--color-bg4)",
  });
  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-bg4">
      <div className="text-[12.5px] text-text2">
        Speaking now with <strong className="text-text">{current.name}</strong> in <strong className="text-text">{language}</strong>
      </div>

      {languages.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text2">Language on calls</span>
          <div className="flex flex-wrap gap-1.5">
            {languages.map((l) => (
              <button key={l} type="button" onClick={() => l !== language && chooseLanguage(l)} className="px-3 py-1 rounded-full text-[12px] font-semibold border cursor-pointer" style={pill(l === language)}>
                {l}
              </button>
            ))}
          </div>
          <span className="text-[11.5px] text-text3">The agent starts in this language and switches if the lead prefers another.</span>
        </div>
      )}

      {greeting && (() => {
        const using = greeting.custom || greeting.suggested;
        const customLines = greeting.custom.split(/\n+/).filter((l) => l.trim());
        const sample = (customLines[0] || using).replace(/\{\{\s*company(Name)?\s*\}\}/gi, greeting.sampleCompany).replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
        return (
          <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-bg4 bg-bg3/60">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[12px] font-semibold text-text2">
                How the call starts{" "}
                <span className="font-normal text-text3">{greeting.custom ? "· your own words" : "· suggested for your business"}</span>
              </span>
              {!editingGreeting && (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => speak("greeting", sample)} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-bold bg-bg2 border border-bg4 text-text cursor-pointer">
                    {playingId === "greeting" ? <IconPlayerPause size={13} /> : <IconPlayerPlay size={13} />} {playingId === "greeting" ? "Stop" : "Listen"}
                  </button>
                  <button type="button" onClick={() => { setGreetingDraft(using); setEditingGreeting(true); }} className="px-2.5 py-1 rounded-md text-[11.5px] font-bold bg-bg2 border border-bg4 text-text cursor-pointer">
                    Edit
                  </button>
                </div>
              )}
            </div>
            {editingGreeting ? (
              <>
                <textarea className="form-input text-[13px]" rows={5} maxLength={1600} value={greetingDraft} placeholder={"नमस्ते जी! मैं Priya, Difmo से बोल रही हूँ। कैसे हैं आप?\nHello! {{company}} से बात हो रही है ना? आप कैसे हैं?"} onChange={(e) => setGreetingDraft(e.target.value)} />
                <span className="text-[11.5px] text-text3">
                  Write up to 5 openings, <strong>one per line</strong> — each call picks one, so calls don&rsquo;t all sound the same. Keep each to one or two short sentences, like a real caller (a greeting, who you are, and &ldquo;कैसे हैं आप?&rdquo; works well). Write <code>{"{{company}}"}</code> where the lead&rsquo;s business name should go.
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  <button type="button" disabled={savingGreeting || !greetingDraft.trim()} onClick={() => saveGreeting(greetingDraft)} className="px-3 py-1.5 rounded-md text-[12px] font-bold text-white border-none cursor-pointer disabled:opacity-50" style={{ background: "#ec4899" }}>
                    {savingGreeting ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingGreeting(false)} className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-bg2 border border-bg4 text-text2 cursor-pointer">Cancel</button>
                  {greeting.custom && (
                    <button type="button" disabled={savingGreeting} onClick={() => saveGreeting("")} className="px-3 py-1.5 rounded-md text-[12px] font-semibold bg-transparent border-none text-text3 underline cursor-pointer">
                      Use the suggested opening instead
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px] text-text m-0 leading-relaxed">&ldquo;{sample}&rdquo;</p>
                <span className="text-[11.5px] text-text3">
                  Example for a lead called &ldquo;{greeting.sampleCompany}&rdquo;.{" "}
                  {greeting.custom
                    ? customLines.length > 1
                      ? `You wrote ${customLines.length} openings — each call picks one of them.`
                      : "Every call starts with these words. Add more lines (Edit) so each call opens differently."
                    : "Each call greets for the time of day, often asks how they are, and varies the wording — then the agent confirms the owner, gives one reason made for their business and asks permission before pitching. Leads you spoke to before hear a follow-up opening."}
                </span>
              </>
            )}
          </div>
        );
      })()}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[12px] font-semibold text-text2">Choose a voice <span className="font-normal text-text3">({options.length} available)</span></span>
        {hasGenders && (
          <div className="flex gap-1.5">
            {(["all", "female", "male"] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGender(g)} className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold border cursor-pointer capitalize" style={pill(g === gender)}>
                {g === "all" ? "All" : g}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {shown.map((v) => {
          const isCurrent = v.id === current.id;
          return (
            <div key={v.id} className="p-3 rounded-xl border flex flex-col gap-2" style={{ borderColor: isCurrent ? "#ec4899" : "var(--color-bg4)", background: isCurrent ? "rgba(236,72,153,0.08)" : "var(--color-bg3)" }}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[13px] font-bold text-text truncate">{v.name}</span>
                {v.gender && <span className="text-[9.5px] uppercase font-bold px-1.5 py-0.5 rounded bg-bg4 text-text3">{v.gender}</span>}
              </div>
              {v.desc && <p className="text-[11px] text-text3 m-0 line-clamp-2">{v.desc}</p>}
              <div className="flex items-center gap-1.5 mt-auto">
                <button
                  type="button"
                  onClick={() => listen(v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11.5px] font-bold bg-bg2 border border-bg4 text-text cursor-pointer"
                >
                  {playingId === v.id ? <IconPlayerPause size={13} /> : <IconPlayerPlay size={13} />}
                  {playingId === v.id ? "Stop" : "Listen"}
                </button>
                {isCurrent ? (
                  <span className="text-[11px] font-bold" style={{ color: "#ec4899" }}>✓ In use</span>
                ) : (
                  <button
                    type="button"
                    disabled={!!switching}
                    onClick={() => choose(v)}
                    className="px-2.5 py-1 rounded-md text-[11.5px] font-bold text-white cursor-pointer border-none disabled:opacity-50"
                    style={{ background: "#ec4899" }}
                  >
                    {switching === v.id ? "…" : "Use"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

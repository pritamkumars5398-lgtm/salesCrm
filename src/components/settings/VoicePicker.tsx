"use client";
import { useEffect, useRef, useState } from "react";
import { IconCheck, IconPlayerPlay, IconPlayerStop, IconSearch } from "@tabler/icons-react";

export interface VoiceOption {
  voiceId: string;
  name: string;
  gender?: string;
  accent?: string;
  age?: string;
  description?: string;
  previewUrl: string | null;
  publicOwnerId?: string;
  freeUsersAllowed?: boolean;
  source: "account" | "library";
}

interface Props {
  agentId: string;
  accountVoices: VoiceOption[];
  selectedId: string;
  onSelect: (voice: VoiceOption) => void;
}

const LANGUAGES = [
  { value: "hi", label: "Hindi" },
  { value: "en", label: "English (incl. Indian)" },
  { value: "", label: "Any language" },
];

/** Browse voices, hear each one's sample, pick one. Library voices are added to the account on save. */
export default function VoicePicker({ agentId, accountVoices, selectedId, onSelect }: Props) {
  const [tab, setTab] = useState<"library" | "account">("library");
  const [language, setLanguage] = useState("hi");
  const [gender, setGender] = useState("female");
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (tab !== "library") return;
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ agentId, library: "1", language, gender, search });
        const res = await fetch(`/api/voice/elevenlabs/setup?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load voices");
        setLibrary(data.voices);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load voices");
      } finally {
        setLoading(false);
      }
    }, 350); // wait for typing to pause
    return () => clearTimeout(t);
  }, [tab, language, gender, search, agentId]);

  useEffect(() => () => { audio.current?.pause(); }, []);

  function toggle(v: VoiceOption) {
    if (playingId === v.voiceId) {
      audio.current?.pause();
      setPlayingId(null);
      return;
    }
    if (!v.previewUrl) return;
    audio.current?.pause();
    const a = new Audio(v.previewUrl);
    audio.current = a;
    a.onended = () => setPlayingId(null);
    a.play().catch(() => setPlayingId(null));
    setPlayingId(v.voiceId);
  }

  const list = tab === "account" ? accountVoices : library;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-lg bg-bg3 p-1 text-[12px] font-semibold">
        {([["library", "Indian & Hindi voices (library)"], ["account", `Your voices (${accountVoices.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="flex-1 rounded-md px-2 py-1.5"
            style={{ background: tab === k ? "var(--color-bg2)" : "transparent", color: tab === k ? "var(--color-text)" : "var(--color-text3)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "library" && (
        <div className="flex flex-wrap gap-2">
          <select className="form-input w-auto py-1.5 text-[12px]" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <select className="form-input w-auto py-1.5 text-[12px]" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="">Any</option>
          </select>
          <div className="relative min-w-[140px] flex-1">
            <IconSearch size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
            <input className="form-input w-full py-1.5 pl-7 text-[12px]" placeholder="Search e.g. warm, Hinglish" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      )}

      {error && <p className="text-[12px] text-red-500">{error}</p>}
      {loading && <p className="text-[12px] text-text3">Loading voices…</p>}

      <div className="max-h-[300px] overflow-y-auto rounded-xl border border-bg4">
        {list.length === 0 && !loading && <p className="p-3 text-[12px] text-text3">No voices found.</p>}
        {list.map((v) => {
          const selected = v.voiceId === selectedId;
          const blocked = v.source === "library" && v.freeUsersAllowed === false;
          return (
            <div key={`${v.source}-${v.voiceId}`} className="flex items-center gap-2 border-b border-bg4 px-3 py-2 last:border-0"
              style={{ background: selected ? "var(--color-primary-subtle)" : "transparent" }}>
              <button onClick={() => toggle(v)} disabled={!v.previewUrl} aria-label={`Play ${v.name}`}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg3 text-text2 disabled:opacity-40">
                {playingId === v.voiceId ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-text">{v.name}</p>
                <p className="truncate text-[11px] text-text3">{[v.gender, v.age, v.accent, v.description].filter(Boolean).join(" · ")}</p>
              </div>
              {blocked && <span className="whitespace-nowrap text-[10.5px] font-semibold text-amber-500" title="The voice owner only allows paid ElevenLabs plans">Paid plan</span>}
              <button onClick={() => onSelect(v)} disabled={selected}
                className="flex items-center gap-1 whitespace-nowrap rounded-md border border-bg4 px-2.5 py-1 text-[11.5px] font-semibold text-text2 disabled:border-transparent disabled:text-emerald-500">
                {selected ? <><IconCheck size={12} /> Selected</> : "Use"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

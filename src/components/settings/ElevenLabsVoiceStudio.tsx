"use client";
import { useEffect, useRef, useState } from "react";
import { IconBrain, IconLoader2, IconPlayerPlay, IconPlayerStop, IconVolume } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import VoicePicker, { type VoiceOption } from "./VoicePicker";

interface Setup {
  llm: string;
  temperature: number;
  voiceId: string;
  voiceName: string;
  voicePreviewUrl: string | null;
  ttsModel: string;
  speed: number;
  stability: number;
  similarity: number;
  language: string;
}

interface Props {
  agentId: string;
  /** the workspace's call greeting, played back in the chosen voice */
  greeting: string;
}

const RECOMMENDED = new Set(["gemini-3.5-flash", "gpt-5.4-mini", "claude-haiku-5-5", "gpt-4o-mini"]);

function providerOf(id: string) {
  if (id.startsWith("gemini")) return "Google Gemini";
  if (id.startsWith("gpt")) return "OpenAI GPT";
  if (id.startsWith("claude")) return "Anthropic Claude";
  return "Other";
}

function Slider({ label, hint, value, min, max, step, onChange }: { label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[12px] font-semibold text-text2">{label}<span className="font-mono text-text3">{value.toFixed(2)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="text-[11px] text-text3">{hint}</span>
    </label>
  );
}

/** Settings → Voice Calls: pick the agent's brain (LLM) and voice, hear samples, tune and save. */
export default function ElevenLabsVoiceStudio({ agentId, greeting }: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [draft, setDraft] = useState<Setup | null>(null);
  const [voice, setVoice] = useState<VoiceOption | null>(null);
  const [llms, setLlms] = useState<string[]>([]);
  const [ttsModels, setTtsModels] = useState<{ id: string; label: string }[]>([]);
  const [accountVoices, setAccountVoices] = useState<VoiceOption[]>([]);
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/voice/elevenlabs/setup?agentId=${agentId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load the agent");
        if (cancelled) return;
        setSetup(data.setup);
        setDraft(data.setup);
        setLlms(data.llms);
        setTtsModels(data.ttsModels);
        setAccountVoices(data.voices);
        setSharedWith(data.sharedWith);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the agent");
      }
    })();
    return () => { cancelled = true; player.current?.pause(); };
  }, [agentId]);

  if (error) return <p className="text-[12px] text-red-500">{error}</p>;
  if (!setup || !draft) return <p className="text-[12px] text-text3">Loading the agent&apos;s voice & brain…</p>;

  const voiceId = voice?.voiceId ?? draft.voiceId;
  const voiceName = voice?.name ?? draft.voiceName;
  const dirty = !!voice || draft.llm !== setup.llm || draft.ttsModel !== setup.ttsModel || draft.speed !== setup.speed
    || draft.stability !== setup.stability || draft.similarity !== setup.similarity || draft.temperature !== setup.temperature;
  const sampleText = (greeting || "नमस्ते जी! मैं प्रिया बात कर रही हूँ। क्या आपके पास दो मिनट हैं?")
    .replace(/\{\{\s*company(Name)?\s*\}\}/gi, "Sea View Hotel")
    .replace(/\{\{\s*leadName\s*\}\}/gi, "Ravi ji")
    .replace(/\{\{[^}]+\}\}/g, "");

  async function hearGreeting() {
    if (speaking) {
      player.current?.pause();
      setSpeaking(false);
      return;
    }
    // A library voice can only be spoken after it's added to the account — play its sample instead.
    if (voice?.source === "library") {
      if (!voice.previewUrl) return;
      player.current = new Audio(voice.previewUrl);
      player.current.onended = () => setSpeaking(false);
      setSpeaking(true);
      player.current.play().catch(() => setSpeaking(false));
      showToast("Playing this voice's sample — save it to hear your own greeting in it.");
      return;
    }
    setSpeaking(true);
    try {
      const res = await fetch("/api/voice/elevenlabs/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, voiceId, text: sampleText, ttsModel: draft!.ttsModel, speed: draft!.speed, stability: draft!.stability, similarity: draft!.similarity }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't play the sample");
      const url = URL.createObjectURL(await res.blob());
      player.current = new Audio(url);
      player.current.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      await player.current.play();
    } catch (err) {
      setSpeaking(false);
      showToast(err instanceof Error ? err.message : "Couldn't play the sample", "error");
    }
  }

  async function save() {
    if (sharedWith.length && !window.confirm(`This ElevenLabs agent is also used by: ${sharedWith.join(", ")}.\nThe new voice and brain apply to their calls too. Save?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/voice/elevenlabs/setup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId, llm: draft!.llm, temperature: draft!.temperature, ttsModel: draft!.ttsModel,
          speed: draft!.speed, stability: draft!.stability, similarity: draft!.similarity,
          ...(voice ? { voiceId: voice.voiceId, voiceName: voice.name, publicOwnerId: voice.source === "library" ? voice.publicOwnerId : undefined } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      setSetup(data.setup);
      setDraft(data.setup);
      setVoice(null);
      showToast("Saved on the ElevenLabs agent — the next call uses it.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  const grouped = llms.reduce<Record<string, string[]>>((acc, id) => {
    const key = RECOMMENDED.has(id) ? "Recommended for Hindi/Hinglish calls" : providerOf(id);
    (acc[key] ||= []).push(id);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-bg4 p-4">
      <div>
        <p className="text-[13.5px] font-bold text-text">Agent voice & brain</p>
        <p className="text-[11.5px] leading-relaxed text-text3">
          Saved on the ElevenLabs agent itself.{sharedWith.length ? ` Also used by: ${sharedWith.join(", ")}.` : ""}
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-text2"><IconBrain size={14} /> Brain (the AI that decides what to say)</span>
        <select className="form-input" value={draft.llm} onChange={(e) => setDraft({ ...draft, llm: e.target.value })}>
          {!llms.includes(draft.llm) && draft.llm && <option value={draft.llm}>{draft.llm} (current)</option>}
          {Object.entries(grouped).map(([group, ids]) => (
            <optgroup key={group} label={group}>
              {ids.map((id) => <option key={id} value={id}>{id}{id === setup.llm ? " (current)" : ""}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="text-[11px] text-text3">Faster models reply quicker on the phone. Gemini Flash and GPT mini models handle Hindi/Hinglish well.</span>
      </label>

      <Slider label="Creativity" hint="0 = sticks closely to the script, 0.5 = more natural variety" value={draft.temperature} min={0} max={1} step={0.05} onChange={(v) => setDraft({ ...draft, temperature: v })} />

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-text2"><IconVolume size={14} /> Voice — now: <span className="text-text">{voiceName}</span>{voice && <span className="text-amber-500">(not saved yet)</span>}</span>
        <VoicePicker agentId={agentId} accountVoices={accountVoices} selectedId={voiceId} onSelect={setVoice} />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-text2">Voice model</span>
        <select className="form-input" value={draft.ttsModel} onChange={(e) => setDraft({ ...draft, ttsModel: e.target.value })}>
          {!ttsModels.some((m) => m.id === draft.ttsModel) && <option value={draft.ttsModel}>{draft.ttsModel}</option>}
          {ttsModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Slider label="Speed" hint="0.7 slow — 1.2 fast" value={draft.speed} min={0.7} max={1.2} step={0.05} onChange={(v) => setDraft({ ...draft, speed: v })} />
        <Slider label="Stability" hint="Low = expressive, high = steady" value={draft.stability} min={0} max={1} step={0.05} onChange={(v) => setDraft({ ...draft, stability: v })} />
        <Slider label="Clarity" hint="How closely it matches the voice" value={draft.similarity} min={0} max={1} step={0.05} onChange={(v) => setDraft({ ...draft, similarity: v })} />
      </div>

      <div className="rounded-lg bg-bg3 px-3 py-2 text-[12px] text-text2">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-text3">Sample line</p>
        {sampleText}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={hearGreeting} className="flex items-center gap-1.5 rounded-lg border border-bg4 px-3 py-2 text-[12.5px] font-semibold text-text2">
          {speaking ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />} {speaking ? "Stop" : "Hear the greeting"}
        </button>
        <button onClick={save} disabled={!dirty || saving} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)" }}>
          {saving && <IconLoader2 size={14} className="animate-spin" />} Save voice & brain
        </button>
      </div>
    </div>
  );
}

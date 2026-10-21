"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconPlayerPlay,
  IconPlayerStop,
  IconSparkles,
  IconVolume,
  IconUser,
  IconLoader2,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { GEMINI_VOICES, type GeminiVoiceDef } from "@/lib/constants/gemini-voices";

interface Props {
  agentId: string;
  currentVoiceId: string;
  greeting: string;
  onSelectVoice: (voiceId: string) => void;
  readOnly?: boolean;
}

export default function GeminiVoiceStudio({
  agentId,
  currentVoiceId,
  greeting,
  onSelectVoice,
  readOnly = false,
}: Props) {
  const showToast = useAppStore((s) => s.showToast);
  const [genderFilter, setGenderFilter] = useState<"all" | "female" | "male">("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [playingGreeting, setPlayingGreeting] = useState(false);
  const [savingVoiceId, setSavingVoiceId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const sampleGreeting = (greeting || "नमस्ते! मैं प्रिया बात कर रही हूँ। क्या आपके पास दो मिनट हैं?")
    .replace(/\{\{\s*company(Name)?\s*\}\}/gi, "SmartHotel Solutions")
    .replace(/\{\{\s*leadName\s*\}\}/gi, "Rahul ji")
    .replace(/\{\{[^}]+\}\}/g, "");

  const filteredVoices = GEMINI_VOICES.filter((v) => {
    if (genderFilter === "female") return v.gender === "female";
    if (genderFilter === "male") return v.gender === "male";
    return true;
  });

  const activeVoiceDef = GEMINI_VOICES.find((v) => v.id.toLowerCase() === currentVoiceId.toLowerCase()) || GEMINI_VOICES[0];

  async function playVoiceSample(voice: GeminiVoiceDef) {
    if (playingVoiceId === voice.id) {
      audioRef.current?.pause();
      setPlayingVoiceId(null);
      return;
    }

    audioRef.current?.pause();
    setPlayingVoiceId(voice.id);
    setPlayingGreeting(false);

    try {
      const sampleSentence = `Hello! This is ${voice.name}, testing voice synthesis with Google Gemini.`;
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          text: sampleSentence,
          voiceId: voice.id,
          provider: "Google Gemini",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate voice preview");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPlayingVoiceId(null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPlayingVoiceId(null);
        showToast("Error playing audio sample", "error");
      };

      await audio.play();
    } catch (err: any) {
      setPlayingVoiceId(null);
      showToast(err.message || "Failed to play voice sample", "error");
    }
  }

  async function playGreetingInVoice() {
    if (playingGreeting) {
      audioRef.current?.pause();
      setPlayingGreeting(false);
      return;
    }

    audioRef.current?.pause();
    setPlayingGreeting(true);
    setPlayingVoiceId(null);

    try {
      const res = await fetch("/api/voice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          text: sampleGreeting,
          voiceId: currentVoiceId || "Puck",
          provider: "Google Gemini",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate greeting preview");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPlayingGreeting(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPlayingGreeting(false);
        showToast("Error playing greeting audio", "error");
      };

      await audio.play();
    } catch (err: any) {
      setPlayingGreeting(false);
      showToast(err.message || "Failed to play greeting", "error");
    }
  }

  async function handleSelectAndSave(voice: GeminiVoiceDef) {
    onSelectVoice(voice.id);
    if (readOnly || !agentId) return;

    setSavingVoiceId(voice.id);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          settings: {
            voiceId: voice.id,
            voiceProvider: "Google Gemini",
          },
        }),
      });

      if (res.ok) {
        showToast(`Google Gemini voice set to ${voice.name} (${voice.gender === "female" ? "Female" : "Male"})`, "success");
      } else {
        showToast("Voice selected. Click 'Save changes' below to permanently save.");
      }
    } catch {
      showToast("Voice selected for preview");
    } finally {
      setSavingVoiceId(null);
    }
  }

  return (
    <div
      className="rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm"
      style={{
        background: "var(--color-bg2)",
        borderColor: "rgba(34,201,122,0.3)",
        borderLeft: "4px solid #22c97a",
      }}
    >
      {/* Header bar */}
      <div
        className="px-6 py-4.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        style={{
          borderColor: "var(--color-bg4)",
          background: "linear-gradient(90deg, rgba(34,201,122,0.1) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[16px] shrink-0"
            style={{ background: "rgba(34,201,122,0.18)", color: "#22c97a" }}
          >
            ✦
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold text-text">Google Gemini Voice Studio</span>
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Native Live Voices
              </span>
            </div>
            <p className="text-[12px] text-text3 m-0 mt-0.5">
              Browse, test audio samples, and set natural female & male Gemini AI voices for live phone calls.
            </p>
          </div>
        </div>

        {/* Current Active Voice pill */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border shrink-0"
          style={{ borderColor: "rgba(34,201,122,0.3)", background: "rgba(34,201,122,0.06)" }}
        >
          <span className="text-[11px] text-text3 font-medium">Selected:</span>
          <span className="text-[12.5px] font-bold text-emerald-400 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                activeVoiceDef.gender === "female" ? "bg-rose-400" : "bg-sky-400"
              }`}
            />
            {activeVoiceDef.name} ({activeVoiceDef.gender === "female" ? "Female" : "Male"})
          </span>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {/* Filter tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-bg3 p-1 rounded-xl border border-bg4 text-[12px] font-semibold">
            <button
              type="button"
              onClick={() => setGenderFilter("all")}
              className={`px-3 py-1.5 rounded-lg transition-all border-none cursor-pointer ${
                genderFilter === "all"
                  ? "bg-bg2 text-text shadow-sm"
                  : "bg-transparent text-text3 hover:text-text"
              }`}
            >
              All Voices ({GEMINI_VOICES.length})
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter("female")}
              className={`px-3 py-1.5 rounded-lg transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                genderFilter === "female"
                  ? "bg-rose-500/15 text-rose-400 shadow-sm border border-rose-500/30"
                  : "bg-transparent text-text3 hover:text-rose-400"
              }`}
            >
              <span>♀</span> Female Voices ({GEMINI_VOICES.filter((v) => v.gender === "female").length})
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter("male")}
              className={`px-3 py-1.5 rounded-lg transition-all border-none cursor-pointer flex items-center gap-1.5 ${
                genderFilter === "male"
                  ? "bg-sky-500/15 text-sky-400 shadow-sm border border-sky-500/30"
                  : "bg-transparent text-text3 hover:text-sky-400"
              }`}
            >
              <span>♂</span> Male Voices ({GEMINI_VOICES.filter((v) => v.gender === "male").length})
            </button>
          </div>

          {/* Quick Greeting Tester button */}
          <button
            type="button"
            onClick={playGreetingInVoice}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer border shrink-0"
            style={{
              borderColor: playingGreeting ? "rgba(34,201,122,0.4)" : "var(--color-bg4)",
              background: playingGreeting ? "rgba(34,201,122,0.15)" : "var(--color-bg3)",
              color: playingGreeting ? "#22c97a" : "var(--color-text)",
            }}
          >
            {playingGreeting ? <IconPlayerStop size={14} /> : <IconVolume size={14} />}
            {playingGreeting ? "Stop Greeting Audio" : `Hear Greeting in ${activeVoiceDef.name}`}
          </button>
        </div>

        {/* Voices Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredVoices.map((voice) => {
            const isSelected = voice.id.toLowerCase() === currentVoiceId.toLowerCase();
            const isPlaying = playingVoiceId === voice.id;
            const isSaving = savingVoiceId === voice.id;
            const isFemale = voice.gender === "female";

            return (
              <div
                key={voice.id}
                onClick={() => handleSelectAndSave(voice)}
                className={`relative rounded-xl border p-4 transition-all duration-150 cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? "border-emerald-500 ring-1 ring-emerald-500/40 bg-emerald-500/5 shadow-sm"
                    : "border-bg4 bg-bg3/40 hover:bg-bg3 hover:border-text4/30"
                }`}
              >
                {/* Top: Avatar, Name & Gender badge */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0 ${
                          isFemale
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                            : "bg-sky-500/15 text-sky-400 border border-sky-500/25"
                        }`}
                      >
                        {isFemale ? "♀" : "♂"}
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-bold text-text m-0 flex items-center gap-1.5">
                          {voice.name}
                          {isSelected && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-500/20 text-emerald-400">
                              Active
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider ${
                              isFemale ? "text-rose-400" : "text-sky-400"
                            }`}
                          >
                            {isFemale ? "Female" : "Male"}
                          </span>
                          <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            ⚡ FREE
                          </span>
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <IconCheck size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  <p className="text-[11.5px] text-text2 font-medium m-0 leading-snug">
                    {voice.desc}
                  </p>
                  <p className="text-[10.5px] text-text3 m-0 mt-1 leading-snug">
                    {voice.tone}
                  </p>
                </div>

                {/* Bottom: Action buttons */}
                <div
                  className="flex items-center justify-between gap-2 pt-2.5 border-t border-bg4/60 mt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => playVoiceSample(voice)}
                    className="flex items-center gap-1.5 px-2.5 py-1.2 rounded-lg text-[11.5px] font-semibold transition-all border cursor-pointer"
                    style={{
                      background: isPlaying ? "rgba(34,201,122,0.15)" : "var(--color-bg2)",
                      borderColor: isPlaying ? "rgba(34,201,122,0.4)" : "var(--color-bg4)",
                      color: isPlaying ? "#22c97a" : "var(--color-text2)",
                    }}
                  >
                    {isPlaying ? <IconPlayerStop size={12} /> : <IconPlayerPlay size={12} />}
                    {isPlaying ? "Playing..." : "Listen"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAndSave(voice)}
                    disabled={isSelected || isSaving}
                    className={`flex items-center gap-1 px-3 py-1.2 rounded-lg text-[11.5px] font-semibold transition-all border-none cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-400 cursor-default"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                    }`}
                  >
                    {isSaving && <IconLoader2 size={11} className="animate-spin" />}
                    {isSelected ? "Selected" : "Set Voice"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sample Greeting banner */}
        <div
          className="rounded-xl p-3.5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[12px]"
          style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)" }}
        >
          <div className="flex items-start gap-2.5">
            <IconSparkles size={16} className="text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-text">Live Workspace Greeting: </span>
              <span className="text-text2 italic">&ldquo;{sampleGreeting}&rdquo;</span>
            </div>
          </div>

          <button
            type="button"
            onClick={playGreetingInVoice}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border-none cursor-pointer shrink-0 transition-all shadow-sm"
          >
            {playingGreeting ? <IconPlayerStop size={13} /> : <IconPlayerPlay size={13} />}
            {playingGreeting ? "Stop Audio" : `Play Greeting (${activeVoiceDef.name})`}
          </button>
        </div>
      </div>
    </div>
  );
}

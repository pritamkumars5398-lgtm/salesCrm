"use client";
import { useEffect, useRef, useState } from "react";
import { IconPlayerPlayFilled, IconPlayerPauseFilled, IconDownload } from "@tabler/icons-react";

const BARS = 72;
const SPEEDS = [1, 1.5, 2];

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

/** Loudness of the recording in BARS slices (0..1) — the real shape of the call. */
async function realWaveform(url: string): Promise<number[]> {
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error();
    return r.arrayBuffer();
  });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.floor(data.length / BARS) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) sum += data[j] * data[j];
      peaks.push(Math.sqrt(sum / step));
    }
    const max = Math.max(...peaks, 0.0001);
    return peaks.map((p) => Math.max(0.08, Math.pow(p / max, 0.8)));
  } finally {
    ctx.close().catch(() => {});
  }
}

/**
 * Call recording player: thin bars showing the real loudness of the call, filling in
 * as it plays, and moving with the voice while it plays. Click the wave to jump.
 * `src` must be same-origin (/api/voice/recording) so the browser can read the sound.
 */
export default function WaveAudioPlayer({ src, downloadUrl, accent = "#df2a2a" }: { src: string; downloadUrl?: string; accent?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const ctxRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(null);
  const rafRef = useRef<number>(0);
  const [shape, setShape] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // The real shape of the call (falls back to an even wave if it can't be read).
  useEffect(() => {
    let alive = true;
    realWaveform(src)
      .then((p) => alive && setShape(p))
      .catch(() => alive && setShape(Array.from({ length: BARS }, (_, i) => 0.3 + 0.25 * Math.abs(Math.sin(i * 0.7)))));
    return () => { alive = false; };
  }, [src]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onPlay = () => { setPlaying(true); setLoading(false); };
    const onPause = () => setPlaying(false);
    const onWait = () => setLoading(true);
    const onErr = () => { setFailed(true); setLoading(false); setPlaying(false); };
    const events: [string, () => void][] = [
      ["timeupdate", onTime], ["loadedmetadata", onMeta], ["durationchange", onMeta], ["play", onPlay],
      ["playing", onPlay], ["pause", onPause], ["ended", onPause], ["waiting", onWait], ["error", onErr],
    ];
    events.forEach(([e, f]) => a.addEventListener(e, f));
    return () => events.forEach(([e, f]) => a.removeEventListener(e, f));
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    ctxRef.current?.ctx.close().catch(() => {});
  }, []);

  // While playing: every bar moves with the live sound, around its real height.
  useEffect(() => {
    if (!playing || !ctxRef.current || !shape) {
      cancelAnimationFrame(rafRef.current);
      barsRef.current.forEach((el) => { if (el) el.style.transform = "scaleY(1)"; });
      return;
    }
    const { analyser } = ctxRef.current;
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(freq);
      // voice lives in the lower bins; mirror them from the centre out so the wave pulses symmetrically
      const usable = Math.floor(freq.length * 0.45);
      const half = BARS / 2;
      barsRef.current.forEach((el, i) => {
        if (!el) return;
        const d = Math.abs(i - half + 0.5) / half; // 0 centre … 1 edges
        const bin = Math.min(usable - 1, Math.floor(d * usable));
        const level = freq[bin] / 255;
        el.style.transform = `scaleY(${(0.35 + level * 1.6).toFixed(3)})`;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, shape]);

  function connectAnalyser() {
    if (ctxRef.current || !audioRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = { ctx, analyser };
    } catch {
      // no live movement, but playback still works
    }
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      connectAnalyser();
      ctxRef.current?.ctx.resume().catch(() => {});
      setLoading(true);
      a.play().catch(() => { setLoading(false); setFailed(true); });
    } else a.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    setTime(a.currentTime);
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const progress = duration ? time / duration : 0;
  const bars = shape ?? Array.from({ length: BARS }, () => 0.15);

  return (
    <div className="flex items-center gap-3 rounded-full px-3 py-2 mb-2.5" style={{ background: "var(--color-bg4)" }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        disabled={failed}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer disabled:opacity-40"
        style={{ background: accent, color: "#fff" }}
      >
        {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} style={{ marginLeft: 2 }} />}
      </button>

      <div
        role="slider"
        aria-label="Recording position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        tabIndex={0}
        onClick={seek}
        onKeyDown={(e) => {
          const a = audioRef.current;
          if (!a) return;
          if (e.key === "ArrowRight") a.currentTime = Math.min(duration, a.currentTime + 5);
          if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 5);
        }}
        className="flex-1 min-w-0 flex items-center justify-between cursor-pointer"
        style={{ height: 36, gap: 2 }}
      >
        {bars.map((h, i) => {
          const played = (i + 0.5) / bars.length <= progress;
          return (
            <span
              key={i}
              ref={(el) => { barsRef.current[i] = el; }}
              style={{
                width: 3,
                flexShrink: 1,
                height: `${Math.max(10, Math.round(h * 100))}%`,
                borderRadius: 3,
                background: played ? accent : "var(--color-text3)",
                opacity: played ? 1 : 0.55,
                transformOrigin: "center",
                transition: "transform 70ms linear, background 0.2s",
              }}
            />
          );
        })}
      </div>

      <span className="shrink-0 text-[12px] font-mono" style={{ color: "var(--color-text2)" }}>
        {failed ? "Can't play" : loading && !playing ? "Loading…" : `${fmt(time)} / ${fmt(duration)}`}
      </span>
      <button
        type="button"
        onClick={cycleSpeed}
        title="Playback speed"
        className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer"
        style={{ background: "transparent", borderColor: "var(--color-bg4)", color: "var(--color-text2)" }}
      >
        {speed}×
      </button>
      <a href={downloadUrl || src} download target="_blank" rel="noopener noreferrer" title="Download recording" aria-label="Download recording" className="shrink-0 flex text-text3 hover:text-text">
        <IconDownload size={16} />
      </a>
    </div>
  );
}

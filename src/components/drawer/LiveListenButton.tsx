"use client";
import { useEffect, useRef, useState } from "react";
import { IconHeadphones, IconHeadphonesOff, IconLoader2, IconVolume, IconVolumeOff } from "@tabler/icons-react";

/**
 * Listen to a live AI call in the browser: both the lead (channel 0) and the
 * agent (channel 1) arrive as mu-law 8kHz frames from /ws/listen. Each channel
 * is scheduled on its own timeline; agent audio arrives faster than real time,
 * so it queues just like Plivo's playback buffer, and "clear" drops it when the
 * lead interrupts — you hear what the lead hears.
 */

const JITTER_SEC = 0.12;
/** If the lead's timeline drifts this far ahead (network burst), snap back to keep latency low. */
const MAX_LEAD_LAG_SEC = 0.6;

const MULAW_TABLE = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff;
    let s = ((u & 0x0f) << 3) + 0x84;
    s <<= (u & 0x70) >> 4;
    t[i] = (u & 0x80 ? 0x84 - s : s - 0x84) / 32768;
  }
  return t;
})();

interface Props {
  callId: string;
  /** stop automatically when the call is no longer live */
  live: boolean;
}

export default function LiveListenButton({ callId, live }: Props) {
  const [state, setState] = useState<"idle" | "connecting" | "listening">("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextTime = useRef<[number, number]>([0, 0]);
  const agentSources = useRef<Set<AudioBufferSourceNode>>(new Set());

  function stop() {
    wsRef.current?.close();
    wsRef.current = null;
    agentSources.current.clear();
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    gainRef.current = null;
    nextTime.current = [0, 0];
    setState("idle");
  }

  async function start() {
    setError(null);
    setState("connecting");
    // Create the AudioContext inside the click so browsers allow playback.
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = muted ? 0 : 1;
    gain.connect(ctx.destination);
    ctxRef.current = ctx;
    gainRef.current = gain;

    try {
      const res = await fetch(`/api/voice/listen?callId=${callId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't start listening");

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/listen?token=${encodeURIComponent(data.token)}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => setState("listening");
      ws.onclose = () => { if (wsRef.current === ws) stop(); };
      ws.onerror = () => setError("Live audio connection failed");
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          const msg = JSON.parse(ev.data);
          if (msg.type === "clear") {
            agentSources.current.forEach((s) => { try { s.stop(); } catch {} });
            agentSources.current.clear();
            nextTime.current[1] = 0;
          } else if (msg.type === "ended") {
            stop();
          }
          return;
        }
        const ctxNow = ctxRef.current;
        const out = gainRef.current;
        if (!ctxNow || !out) return;
        const bytes = new Uint8Array(ev.data as ArrayBuffer);
        const channel = bytes[0] === 1 ? 1 : 0;
        const n = bytes.length - 1;
        if (n <= 0) return;

        const buffer = ctxNow.createBuffer(1, n, 8000);
        const pcm = buffer.getChannelData(0);
        for (let i = 0; i < n; i++) pcm[i] = MULAW_TABLE[bytes[i + 1]];

        const now = ctxNow.currentTime;
        let at = Math.max(now + JITTER_SEC, nextTime.current[channel]);
        if (channel === 0 && at - now > MAX_LEAD_LAG_SEC) at = now + JITTER_SEC;

        const src = ctxNow.createBufferSource();
        src.buffer = buffer;
        src.connect(out);
        src.start(at);
        nextTime.current[channel] = at + buffer.duration;
        if (channel === 1) {
          agentSources.current.add(src);
          src.onended = () => agentSources.current.delete(src);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start listening");
      stop();
    }
  }

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = muted ? 0 : 1;
  }, [muted]);

  // Stop when the call ends or the component goes away.
  useEffect(() => { if (!live && state !== "idle") stop(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-1.5">
      {state === "listening" && (
        <button
          onClick={() => setMuted((m) => !m)}
          className="w-7 h-7 rounded-[7px] flex items-center justify-center"
          style={{ background: "var(--color-bg3)", color: "var(--color-text2)" }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <IconVolumeOff size={14} /> : <IconVolume size={14} />}
        </button>
      )}
      <button
        onClick={() => (state === "idle" ? start() : stop())}
        disabled={state === "connecting"}
        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[11.5px] font-semibold transition-all"
        style={{
          background: state === "listening" ? "rgba(255,107,107,0.14)" : "rgba(108,99,255,0.16)",
          color: state === "listening" ? "#ff6b6b" : "#8b84ff",
          cursor: state === "connecting" ? "wait" : "pointer",
        }}
        title={error ?? (state === "listening" ? "Stop listening" : "Hear both sides of this call live")}
      >
        {state === "connecting" ? <IconLoader2 size={13} className="animate-spin" />
          : state === "listening" ? <IconHeadphonesOff size={13} /> : <IconHeadphones size={13} />}
        {state === "connecting" ? "Connecting…" : state === "listening" ? "Stop listening" : "Listen live"}
      </button>
      {error && state === "idle" && (
        <span className="text-[10.5px]" style={{ color: "#ff6b6b" }}>{error}</span>
      )}
    </div>
  );
}

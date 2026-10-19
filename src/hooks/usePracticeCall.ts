import { useCallback, useEffect, useRef, useState } from "react";
import { decodeAgentAudio, encodeMicAudio, parseFormat, type AudioFormat } from "@/lib/audio/pcm-codec";

export interface PracticeTurn {
  role: "agent" | "you" | "system";
  text: string;
}

export interface PracticePreview {
  greeting: string;
  prompt: string;
  leadName: string;
}

type Status = "idle" | "connecting" | "live" | "ended";

/**
 * A browser-only conversation with the real ElevenLabs agent, briefed exactly
 * like a phone call (see /api/voice/practice). Voice mode streams the mic;
 * text works in both modes. Nothing is dialed.
 */
export function usePracticeCall(agentId: string | undefined, leadId: string | null) {
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<PracticeTurn[]>([]);
  const [preview, setPreview] = useState<PracticePreview | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [error, setError] = useState("");

  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const mic = useRef<{ stream: MediaStream; node: ScriptProcessorNode; source: MediaStreamAudioSourceNode } | null>(null);
  const outFormat = useRef<AudioFormat>(parseFormat(undefined));
  const inFormat = useRef<AudioFormat>(parseFormat(undefined));
  const playing = useRef<AudioBufferSourceNode[]>([]);
  const nextStart = useRef(0);

  const add = (turn: PracticeTurn) => setTurns((t) => [...t, turn]);

  const stopPlayback = () => {
    playing.current.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    playing.current = [];
    nextStart.current = 0;
    setAgentSpeaking(false);
  };

  const cleanup = useCallback(() => {
    stopPlayback();
    if (mic.current) {
      mic.current.node.disconnect();
      mic.current.source.disconnect();
      mic.current.stream.getTracks().forEach((t) => t.stop());
      mic.current = null;
    }
    if (ws.current && ws.current.readyState <= WebSocket.OPEN) ws.current.close();
    ws.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  function play(b64: string) {
    const audio = ctx.current;
    if (!audio) return;
    const samples = decodeAgentAudio(b64, outFormat.current);
    if (samples.length === 0) return;
    const buffer = audio.createBuffer(1, samples.length, outFormat.current.rate);
    buffer.copyToChannel(samples, 0);
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.destination);
    const at = Math.max(audio.currentTime + 0.02, nextStart.current);
    src.start(at);
    nextStart.current = at + buffer.duration;
    playing.current.push(src);
    setAgentSpeaking(true);
    src.onended = () => {
      playing.current = playing.current.filter((s) => s !== src);
      if (playing.current.length === 0) setAgentSpeaking(false);
    };
  }

  async function startMic(socket: WebSocket, audio: AudioContext) {
    // Echo cancellation keeps the agent's own voice from being heard back (headphones are still best).
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const source = audio.createMediaStreamSource(stream);
    const node = audio.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const chunk = encodeMicAudio(e.inputBuffer.getChannelData(0), audio.sampleRate, inFormat.current);
      socket.send(JSON.stringify({ user_audio_chunk: chunk }));
    };
    source.connect(node);
    // A ScriptProcessor only runs while connected to an output; it writes silence.
    node.connect(audio.destination);
    mic.current = { stream, node, source };
  }

  const start = useCallback(async (mode: "voice" | "text") => {
    if (!agentId || status === "connecting" || status === "live") return;
    setError("");
    setTurns([]);
    setStatus("connecting");
    try {
      const res = await fetch("/api/voice/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start the practice call.");
      setPreview(data.preview);

      // Created inside the click handler so the browser allows audio playback.
      const audio = new AudioContext();
      ctx.current = audio;
      const socket = new WebSocket(data.signedUrl);
      ws.current = socket;
      let spoke = false;

      socket.onopen = () => socket.send(JSON.stringify(data.initiation));
      socket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "conversation_initiation_metadata": {
            const meta = msg.conversation_initiation_metadata_event || {};
            outFormat.current = parseFormat(meta.agent_output_audio_format);
            inFormat.current = parseFormat(meta.user_input_audio_format);
            setStatus("live");
            if (mode === "voice") {
              try {
                await startMic(socket, audio);
              } catch {
                add({ role: "system", text: "Microphone blocked — you can still type your replies below." });
              }
            }
            break;
          }
          case "audio":
            spoke = true;
            if (msg.audio_event?.audio_base_64) play(msg.audio_event.audio_base_64);
            break;
          case "agent_response":
            add({ role: "agent", text: msg.agent_response_event?.agent_response ?? "" });
            break;
          case "agent_response_correction": {
            const corrected = msg.agent_response_correction_event?.corrected_agent_response;
            if (corrected) {
              setTurns((t) => {
                const i = t.map((x) => x.role).lastIndexOf("agent");
                return i === -1 ? t : t.map((x, j) => (j === i ? { ...x, text: `${corrected} (cut off)` } : x));
              });
            }
            break;
          }
          case "user_transcript": {
            const text = msg.user_transcription_event?.user_transcript?.trim();
            if (text && !/^[\s.…,!?-]*$/.test(text)) add({ role: "you", text });
            break;
          }
          case "interruption":
            stopPlayback();
            break;
          case "ping":
            socket.send(JSON.stringify({ type: "pong", event_id: msg.ping_event?.event_id }));
            break;
          case "client_tool_call": {
            const tc = msg.client_tool_call || {};
            const isWhatsApp = tc.tool_name === "send_whatsapp_details";
            add({ role: "system", text: isWhatsApp
              ? `On a real call the agent would now send WhatsApp details${tc.parameters?.topic ? ` about "${tc.parameters.topic}"` : ""}. (Not sent — practice mode.)`
              : `Agent used tool "${tc.tool_name}".` });
            socket.send(JSON.stringify({
              type: "client_tool_result", tool_call_id: tc.tool_call_id, is_error: false,
              result: isWhatsApp ? "Sent on WhatsApp — the lead now has our website, booking link and contact details." : "Done.",
            }));
            break;
          }
        }
      };
      socket.onclose = (e) => {
        if (!spoke && e.reason) {
          setError(/override/i.test(e.reason)
            ? `${e.reason} — open Settings → Voice Calls → Check & fix ElevenLabs and press Fix.`
            : `ElevenLabs closed the session: ${e.reason}`);
        } else {
          add({ role: "system", text: e.reason && !/end_call|ended/i.test(e.reason) ? `Call ended (${e.reason}).` : "Call ended." });
        }
        setStatus("ended");
        cleanup();
      };
      socket.onerror = () => setError("Lost the connection to ElevenLabs.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the practice call.");
      setStatus("idle");
      cleanup();
    }
  }, [agentId, leadId, status, cleanup]);

  const sendText = useCallback((text: string) => {
    const socket = ws.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !text.trim()) return;
    stopPlayback();
    socket.send(JSON.stringify({ type: "user_message", text: text.trim() }));
    add({ role: "you", text: text.trim() });
  }, []);

  const end = useCallback(() => {
    cleanup();
    setStatus((s) => (s === "idle" ? s : "ended"));
  }, [cleanup]);

  return { status, turns, preview, agentSpeaking, error, start, sendText, end, micOn: !!mic.current };
}

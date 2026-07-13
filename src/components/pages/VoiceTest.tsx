"use client";
import { useState, useRef, useEffect } from "react";
import { IconMicrophone, IconPlayerStop, IconActivity, IconSend } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";

export default function VoiceTest() {
  const { activeAgent } = useAppStore();
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [textInput, setTextInput] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [volume, setVolume] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg].slice(-50));
  };

  const playNextAudio = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const base64Audio = audioQueueRef.current.shift();

    if (base64Audio) {
      try {
        const audioBlob = await fetch(`data:audio/mp3;base64,${base64Audio}`).then(r => r.blob());
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;

        audio.onended = () => {
          currentAudioRef.current = null;
          isPlayingRef.current = false;
          playNextAudio(); // play the next chunk
        };

        await audio.play();
      } catch (err) {
        console.error("Audio playback error:", err);
        currentAudioRef.current = null;
        isPlayingRef.current = false;
        playNextAudio();
      }
    } else {
      isPlayingRef.current = false;
    }
  };

  const startCall = async () => {
    if (!activeAgent) {
      addLog("No active agent selected.");
      return;
    }

    try {
      setStatus("connecting");
      addLog("Connecting to WebSocket server...");

      const ws = new WebSocket(`ws://localhost:8080?agentId=${activeAgent._id}`);
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus("connected");
        addLog("Connected! Requesting microphone access...");

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          // --- Audio Visualizer Setup ---
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (wsRef.current?.readyState !== WebSocket.OPEN) {
              setVolume(0);
              return;
            }
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            // Boost volume visually
            setVolume(Math.min(100, Math.round((average / 255) * 150)));
            requestAnimationFrame(updateVolume);
          };
          updateVolume();
          // ------------------------------

          const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
              const reader = new FileReader();
              reader.readAsDataURL(event.data);
              reader.onloadend = () => {
                const base64data = (reader.result as string).split(',')[1];
                ws.send(JSON.stringify({ type: "audio_in", data: base64data }));
              };
            }
          };

          // Capture audio in tiny chunks (every 250ms)
          mediaRecorder.start(250);
          addLog("Microphone active. Start speaking!");
        } catch (err) {
          addLog("Microphone access denied.");
          setStatus("idle");
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript") {
            setTranscript(data.text);
            addLog(`You: ${data.text}`);
          } else if (data.type === "agent_text") {
            const providerText = data.provider ? ` (${data.provider})` : "";
            addLog(`Agent${providerText}: ${data.text}`);
          } else if (data.type === "audio_out") {
            // Push ElevenLabs audio chunk to queue and attempt to play
            audioQueueRef.current.push(data.data);
            playNextAudio();
          } else if (data.type === "error") {
            addLog(`Error: ${data.message}`);
          } else if (data.type === "interruption") {
            audioQueueRef.current = [];
            if (currentAudioRef.current) {
              currentAudioRef.current.pause();
              currentAudioRef.current.currentTime = 0;
              currentAudioRef.current = null;
            }
            isPlayingRef.current = false;
          }
        } catch (err) {
          console.error("Failed to parse ws message", err);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        addLog("WebSocket connection error (Server not running?)");
      };

      ws.onclose = () => {
        stopCall();
      };

    } catch (err) {
      console.error(err);
      setStatus("idle");
    }
  };

  const sendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({ type: "text_in", text: textInput.trim() }));
    addLog(`You (Text): ${textInput.trim()}`);
    setTranscript(textInput.trim());
    setTextInput("");
  };

  const stopCall = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setStatus("idle");
    addLog("Call ended.");
  };

  useEffect(() => {
    return () => {
      stopCall();
    };
  }, []);

  return (
    <div className="p-8 font-sans h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <IconMicrophone size={24} className="text-blue-500" />
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Real-Time Voice AI</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Voice Call, Transcript, and Text Input */}
          <div className="flex flex-col gap-6">
            <div className="p-8 rounded-xl border flex flex-col items-center justify-center min-h-[250px] text-center shadow-sm transition-all" style={{ background: "var(--color-bg)", borderColor: status === "connected" ? "var(--color-green)" : "rgba(0,0,0,0.1)" }}>
              {status === "connected" ? (
                <div className="mb-8 flex flex-col items-center">
                  <div
                    className="relative flex items-center justify-center rounded-full"
                    style={{
                      width: '80px',
                      height: '80px',
                      background: `rgba(34, 197, 94, ${0.1 + (volume / 100) * 0.4})`,
                      transform: `scale(${1 + (volume / 100) * 0.5})`,
                      transition: 'transform 0.05s ease-out, background-color 0.05s ease-out'
                    }}
                  >
                    <IconActivity size={40} color="var(--color-green)" />
                  </div>
                  <p className="mt-6 font-semibold text-[15px]" style={{ color: "var(--color-green)" }}>
                    AI is listening...
                  </p>
                </div>
              ) : (
                <p className="mb-8 text-[14px]" style={{ color: "var(--color-text3)" }}>
                  Ensure your microphone is connected, then click start to begin the conversation.
                </p>
              )}

              <div className="flex gap-4">
                {status !== "connected" ? (
                  <button
                    onClick={startCall}
                    disabled={status === "connecting"}
                    className="px-6 py-3 rounded-lg flex items-center gap-2 font-medium text-white shadow transition-transform hover:scale-105 active:scale-95"
                    style={{ background: status === "connecting" ? "#94a3b8" : "#3b82f6" }}
                  >
                    <IconMicrophone size={18} />
                    {status === "connecting" ? "Connecting..." : "Start Call"}
                  </button>
                ) : (
                  <button
                    onClick={stopCall}
                    className="px-6 py-3 rounded-lg flex items-center gap-2 font-medium text-white shadow bg-red-500 transition-transform hover:scale-105 active:scale-95"
                  >
                    <IconPlayerStop size={18} />
                    End Call
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border flex-1 min-h-[150px] max-h-[300px] flex flex-col" style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.06)" }}>
              <h3 className="font-semibold text-[13px] mb-3 shrink-0" style={{ color: "var(--color-text)" }}>Live Transcript</h3>
              <div className="text-[14px] italic overflow-y-auto flex-1 pr-2" style={{ color: "var(--color-text3)" }}>
                {transcript || "Speak to see your transcript here..."}
              </div>
            </div>

            {status === "connected" && (
              <form onSubmit={sendText} className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.length === 1 && textInput.length === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({ type: "user_typing_interruption" }));
                    }
                    setTextInput(val);
                  }}
                  placeholder="Type a message to the AI..."
                  className="flex-1 px-4 py-2 rounded-lg border outline-none focus:border-blue-500"
                  style={{ background: "var(--color-bg)", borderColor: "rgba(0,0,0,0.1)", color: "var(--color-text)" }}
                />
                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  className="p-2 flex items-center justify-center rounded-lg bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                >
                  <IconSend size={20} />
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Debug Logs */}
          <div className="p-4 rounded-xl border bg-black text-green-400 font-mono text-[13px] flex flex-col h-full min-h-[300px] max-h-[500px]">
            <h3 className="font-semibold mb-2 text-white border-b border-gray-800 pb-2 shrink-0">Debug Logs</h3>
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-2">
              {logs.length === 0 && <span className="text-text3">Waiting for events...</span>}
              {logs.map((log, i) => (
                <div key={i} className="break-words">&gt; {log}</div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

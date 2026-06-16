import { useRef, useEffect } from "react";
import type { Message, Lead } from "@/store/types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props { messages: Message[]; lead: Lead; }

export default function SMSConvo({ messages, lead }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages]);

  return (
    <div ref={bodyRef} className="h-full overflow-y-auto p-4 flex flex-col gap-2" style={{ background: "var(--color-bg)" }}>
      <div className="text-center text-[11px] mb-2" style={{ color: "var(--color-text3)" }}>Today</div>

      {messages.length === 0 && (
        <p className="text-center text-[12px] mt-8" style={{ color: "var(--color-text3)" }}>No SMS messages yet</p>
      )}

      {messages.map((msg, i) => (
        <div key={i} className={`flex flex-col mb-2 ${msg.role === "agent" ? "items-end" : "items-start"}`}>
          <div
            className="max-w-[78%] px-3.5 py-2.5 text-[13px] leading-[1.5]"
            style={{
              borderRadius: msg.role === "agent" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: msg.role === "agent" ? "#007aff" : "var(--color-bg3)",
              color: msg.role === "agent" ? "#fff" : "var(--color-text)",
            }}
          >
            {msg.content}
          </div>
          <span className="text-[10.5px] mt-1 px-1" style={{ color: "var(--color-text3)" }}>
            {formatTime(msg.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

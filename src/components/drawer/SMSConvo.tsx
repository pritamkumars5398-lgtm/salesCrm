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
    <div ref={bodyRef} className="h-full overflow-y-auto p-4 flex flex-col gap-2.5" style={{ background: "var(--color-bg)" }}>
      <div className="text-center text-[10.5px] mb-1 flex-shrink-0" style={{ color: "var(--color-text3)" }}>
        Text Message
      </div>

      {messages.length === 0 && (
        <p className="text-center text-[12px] mt-8" style={{ color: "var(--color-text3)" }}>No SMS messages yet</p>
      )}

      {messages.map((msg, i) => {
        const isAgent = msg.role === "agent";
        return (
          <div key={i} className={`flex flex-col mb-1 ${isAgent ? "items-end" : "items-start"}`}>
            <div
              className="max-w-[78%] px-3.5 py-2.5 text-[13px] leading-[1.5] shadow-sm whitespace-pre-wrap font-[family-name:var(--font-sans)] border"
              style={{
                borderRadius: isAgent ? "16px 16px 3px 16px" : "16px 16px 16px 3px",
                background: isAgent ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : "var(--color-bg3)",
                borderColor: isAgent ? "rgba(59, 130, 246, 0.15)" : "rgba(0,0,0,0.06)",
                color: isAgent ? "#fff" : "var(--color-text)",
              }}
            >
              {msg.content}
            </div>
            <span className="text-[10px] mt-1 px-1.5" style={{ color: "var(--color-text3)" }}>
              {isAgent ? "Sent" : lead.fullName} · {formatTime(msg.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

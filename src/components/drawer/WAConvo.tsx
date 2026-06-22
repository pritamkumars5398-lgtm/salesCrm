import { useRef, useEffect } from "react";
import { IconChecks } from "@tabler/icons-react";
import type { Message, Lead } from "@/store/types";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props { messages: Message[]; lead: Lead; }

export default function WAConvo({ messages, lead }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages]);

  return (
    <div ref={bodyRef} className="h-full overflow-y-auto flex flex-col gap-2 p-4" style={{ background: "var(--color-bg)" }}>
      {/* WA header */}
      <div
        className="flex items-center gap-3 -mx-4 -mt-4 mb-3 px-4 py-3 border-b flex-shrink-0"
        style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.08)" }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 shadow-sm"
          style={{ background: "linear-gradient(135deg, #22c97a, #10b981)", color: "#fff" }}
        >
          {lead.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-[13.5px] font-semibold" style={{ color: "var(--color-text)" }}>{lead.fullName}</div>
          <div className="text-[11.5px]" style={{ color: "var(--color-text3)" }}>{lead.phone || "WhatsApp"}</div>
        </div>
      </div>

      <div className="text-center my-1 flex-shrink-0">
        <span className="text-[10.5px] px-2.5 py-0.5 rounded-full font-medium" style={{ background: "var(--color-bg4)", color: "var(--color-text3)" }}>
          WhatsApp Chat
        </span>
      </div>

      {messages.length === 0 && (
        <p className="text-center text-[12px] mt-8" style={{ color: "var(--color-text3)" }}>No WhatsApp messages yet</p>
      )}

      {messages.map((msg, i) => {
        const isAgent = msg.role === "agent";
        return (
          <div key={i} className={`flex flex-col mb-1.5 ${isAgent ? "items-end" : "items-start"}`}>
            {!isAgent && (
              <span className="text-[10px] font-bold mb-1 px-1" style={{ color: "#22c97a" }}>{lead.fullName}</span>
            )}
            <div
              className={`max-w-[80%] px-3 py-2 text-[13px] leading-[1.5] shadow-sm whitespace-pre-wrap border font-[family-name:var(--font-sans)]`}
              style={{
                borderRadius: isAgent ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                background: isAgent ? "rgba(34, 201, 122, 0.08)" : "var(--color-bg3)",
                borderColor: isAgent ? "rgba(34, 201, 122, 0.18)" : "rgba(0,0,0,0.06)",
                color: "var(--color-text)",
              }}
            >
              {msg.content}
              <div className="flex items-center justify-end gap-1 mt-1 text-[9.5px]" style={{ color: "var(--color-text3)" }}>
                <span>
                  {formatTime(msg.timestamp)}
                </span>
                {isAgent && <IconChecks size={11} style={{ color: "#22c97a" }} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

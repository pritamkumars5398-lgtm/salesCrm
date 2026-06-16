import { useRef, useEffect } from "react";
import { IconChecks } from "@tabler/icons-react";
import type { Message } from "@/store/types";
import type { Lead } from "@/store/types";
import Avatar from "@/components/ui/Avatar";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props { messages: Message[]; lead: Lead; }

export default function WAConvo({ messages, lead }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages]);

  return (
    <div ref={bodyRef} className="h-full overflow-y-auto flex flex-col gap-1.5 p-4" style={{ background: "var(--color-bg2)" }}>
      {/* WA header */}
      <div
        className="flex items-center gap-2.5 -mx-4 -mt-4 mb-3 px-4 py-2.5 border-b flex-shrink-0"
        style={{ background: "#ffffff", borderColor: "rgba(0,0,0,0.08)" }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
          style={{ background: "#dcf8c6", color: "#111111" }}
        >
          {lead.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
        </div>
        <div>
          <div className="text-[13.5px] font-semibold" style={{ color: "var(--color-text)" }}>{lead.fullName}</div>
          <div className="text-[11.5px]" style={{ color: "var(--color-text2)" }}>{lead.phone || "WhatsApp"}</div>
        </div>
      </div>

      <div className="text-center my-2">
        <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: "var(--color-bg4)", color: "var(--color-text2)" }}>
          Today
        </span>
      </div>

      {messages.length === 0 && (
        <p className="text-center text-[12px] mt-8" style={{ color: "var(--color-text3)" }}>No WhatsApp messages yet</p>
      )}

      {messages.map((msg, i) => (
        <div key={i} className={`flex flex-col mb-1.5 ${msg.role === "agent" ? "items-end" : "items-start"}`}>
          {msg.role === "lead" && (
            <span className="text-[11px] font-semibold mb-1" style={{ color: "#22c97a" }}>{lead.fullName}</span>
          )}
          <div
            className="max-w-[78%] px-3 py-2 rounded-xl text-[13px] leading-[1.5]"
            style={
              msg.role === "agent"
                ? { background: "#dcf8c6", color: "#111111" }
                : { background: "#ffffff", color: "var(--color-text)" }
            }
          >
            {msg.content}
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[10px]" style={{ color: "rgba(0,0,0,0.45)" }}>
                {formatTime(msg.timestamp)}
              </span>
              {msg.role === "agent" && <IconChecks size={12} style={{ color: "#53bdeb" }} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

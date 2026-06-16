import { useRef, useEffect } from "react";
import { IconEye } from "@tabler/icons-react";
import type { Message, Lead } from "@/store/types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
}

interface Props { messages: Message[]; lead: Lead; }

export default function EmailConvo({ messages, lead }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages]);

  return (
    <div ref={bodyRef} className="h-full overflow-y-auto p-4 flex flex-col gap-3" style={{ background: "var(--color-bg)" }}>
      {messages.length === 0 && (
        <p className="text-center text-[12px] mt-8" style={{ color: "var(--color-text3)" }}>No emails yet</p>
      )}
      {messages.map((msg, i) => (
        <div
          key={i}
          className="rounded-[14px] overflow-hidden border"
          style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}
        >
          <div className="flex items-start justify-between gap-2.5 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                style={
                  msg.role === "agent"
                    ? { background: "rgba(108,99,255,0.12)", color: "var(--color-accent2)" }
                    : { background: "rgba(77,171,247,0.1)", color: "#4dabf7" }
                }
              >
                {msg.role === "agent" ? "SA" : lead.fullName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </div>
              <div>
                <div className="text-[13px] font-medium">
                  {msg.role === "agent" ? "SalesAgent" : lead.fullName}
                </div>
                <div className="text-[11.5px] mt-0.5" style={{ color: "var(--color-text3)" }}>
                  {msg.role === "agent" ? `agent@yourdomain.com → ${lead.email}` : `${lead.email} → agent@yourdomain.com`}
                </div>
              </div>
            </div>
            <div className="text-right text-[11.5px] flex-shrink-0" style={{ color: "var(--color-text3)" }}>
              {formatTime(msg.timestamp)}
              {msg.role === "agent" && (
                <div className="flex items-center gap-1 mt-1 text-[10.5px] px-2 py-0.5 rounded-full" style={{ background: "rgba(34,201,122,0.1)", color: "#22c97a" }}>
                  <IconEye size={10} /> Opened
                </div>
              )}
            </div>
          </div>
          <div className="px-4 pb-4 text-[13px] leading-[1.7] border-t pt-3" style={{ color: "var(--color-text2)", borderColor: "rgba(0,0,0,0.1)" }}>
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useRef, useEffect } from "react";
import { IconUser, IconMail } from "@tabler/icons-react";
import type { Message, Lead } from "@/store/types";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function parseEmail(content: string) {
  const subjectRegex = /^Subject:\s*(.*?)\n+([\s\S]*)$/i;
  const match = content.match(subjectRegex);
  if (match) {
    return {
      subject: match[1].trim(),
      body: match[2].trim()
    };
  }
  return {
    subject: null,
    body: content.trim()
  };
}

interface Props { messages: Message[]; lead: Lead; }

export default function EmailConvo({ messages, lead }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages]);

  // Extract the thread subject from the first email that contains one
  const threadSubject = messages
    .map((m) => parseEmail(m.content).subject)
    .find((s) => !!s) || null;

  return (
    <div ref={bodyRef} className="h-full overflow-y-auto flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Thread Subject Header at the top (Gmail style) */}
      {threadSubject && (
        <div className="px-4 py-2.5 border-b flex-shrink-0 flex items-center gap-2" style={{ borderColor: "rgba(0,0,0,0.06)", background: "var(--color-bg2)" }}>
          <IconMail size={15} style={{ color: "var(--color-text3)" }} />
          <h2 className="text-[14px] font-bold truncate" style={{ color: "var(--color-text)" }}>
            {threadSubject}
          </h2>
        </div>
      )}

      <div className="p-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-center text-[12px] mt-4" style={{ color: "var(--color-text3)" }}>No emails yet</p>
        )}

        {messages.map((msg, i) => {
          const { body } = parseEmail(msg.content);
          const isAgent = msg.role === "agent";

          return (
            <div key={i} className="flex flex-col">
              {/* Divider between thread items */}
              {i > 0 && (
                <div className="border-t w-full mb-4" style={{ borderColor: "rgba(0,0,0,0.06)" }} />
              )}

              {/* Message Header */}
              <div className="flex items-start justify-between gap-2.5 mb-2">
                <div className="flex items-start gap-2.5">
                  {/* Avatar */}
                  {isAgent ? (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm flex-shrink-0"
                      style={{ background: "#2e7d32" /* Gmail Agent Green */ }}
                    >
                      AG
                    </div>
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.4)" }}
                    >
                      <IconUser size={16} />
                    </div>
                  )}

                  {/* Sender Details */}
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: "var(--color-text)" }}>
                      {isAgent ? "Agent" : lead.fullName}{" "}
                      <span className="font-normal text-[11.5px] ml-1" style={{ color: "var(--color-text3)" }}>
                        &lt;{isAgent ? "agent@yourdomain.com" : lead.email}&gt;
                      </span>
                    </div>
                    <div className="text-[11.5px] mt-0.5 flex items-center gap-1 font-medium" style={{ color: "var(--color-text3)" }}>
                      <span>to {isAgent ? lead.fullName.split(" ")[0] : "Agent"}</span>
                      <span className="text-[8px] scale-75 opacity-70">▼</span>
                    </div>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="text-right text-[11.5px] whitespace-nowrap" style={{ color: "var(--color-text3)" }}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>

              {/* Message Body (Indented pl-[38px] to line up with the sender text, matching compact layout) */}
              <div
                className="pl-[38px] pr-2 text-[12.5px] leading-[1.5] whitespace-pre-wrap font-[family-name:var(--font-sans)]"
                style={{ color: "var(--color-text)" }}
              >
                {body}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

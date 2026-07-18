"use client";
import { IconSearch } from "@tabler/icons-react";
import Avatar from "@/components/ui/Avatar";
import type { Channel, Lead, Message } from "@/store/types";

export interface InboxItem {
  lead: Lead;
  lastMessage: Message | null;
}

interface Props {
  items: InboxItem[];
  channel: Channel;
  selectedLeadId: string | null;
  onSelect: (lead: Lead) => void;
  search: string;
  onSearchChange: (v: string) => void;
  loading?: boolean;
  headerActions?: React.ReactNode;
  accentColor: string;
}

function previewText(msg: Message | null, channel: Channel): string {
  if (!msg) return channel === "email" ? "No emails yet" : "No messages yet";
  let text = msg.content;
  if (channel === "email") {
    const match = text.match(/^Subject:\s*(.*?)\n+([\s\S]*)$/i);
    if (match) text = match[2] || match[1];
  }
  text = text.replace(/\s+/g, " ").trim();
  const prefix = msg.role === "agent" ? "You: " : "";
  return prefix + (text.length > 64 ? text.slice(0, 64) + "…" : text);
}

function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

export default function InboxLeadList({
  items, channel, selectedLeadId, onSelect, search, onSearchChange, loading, headerActions, accentColor,
}: Props) {
  return (
    <div className="flex flex-col h-full" style={{ width: 300, borderRight: "1px solid var(--color-bg4)", background: "var(--color-bg2)" }}>
      <div className="p-3 flex flex-col gap-2 flex-shrink-0 border-b" style={{ borderColor: "var(--color-bg4)" }}>
        <div className="relative">
          <IconSearch size={14} className="absolute top-1/2 -translate-y-1/2 left-2.5" style={{ color: "var(--color-text3)" }} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search leads..."
            className="w-full text-[12.5px] rounded-lg pl-8 pr-3 py-2 outline-none border"
            style={{ background: "var(--color-bg3)", borderColor: "var(--color-bg4)", color: "var(--color-text)" }}
          />
        </div>
        {headerActions}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-[12px]" style={{ color: "var(--color-text3)" }}>
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center gap-1">
            <p className="text-[12.5px] font-medium" style={{ color: "var(--color-text2)" }}>No leads found</p>
            <p className="text-[11px]" style={{ color: "var(--color-text3)" }}>
              {search ? "Try a different search." : `Leads with a valid ${channel === "email" ? "email address" : "phone number"} will show up here.`}
            </p>
          </div>
        ) : (
          items.map(({ lead, lastMessage }) => {
            const isSelected = lead._id === selectedLeadId;
            return (
              <button
                key={lead._id}
                onClick={() => onSelect(lead)}
                className="flex items-start gap-2.5 w-full text-left px-3 py-2.5 border-none cursor-pointer transition-colors"
                style={{ background: isSelected ? "var(--color-bg3)" : "transparent", borderBottom: "1px solid var(--color-bg4)" }}
              >
                <Avatar name={lead.fullName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold truncate" style={{ color: isSelected ? accentColor : "var(--color-text)" }}>
                      {lead.fullName}
                    </span>
                    <span className="text-[10px] flex-shrink-0" style={{ color: "var(--color-text3)" }}>
                      {formatTimestamp(lastMessage?.timestamp)}
                    </span>
                  </div>
                  <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--color-text3)", fontStyle: lastMessage ? "normal" : "italic" }}>
                    {previewText(lastMessage, channel)}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

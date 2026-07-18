"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconPencilPlus, IconInbox } from "@tabler/icons-react";
import type { Channel, Lead } from "@/store/types";
import InboxLeadList, { type InboxItem } from "./InboxLeadList";
import ChannelConversationThread from "./ChannelConversationThread";
import ComposeEmailModal from "./ComposeEmailModal";

const CHANNEL_META: Record<string, { color: string; requires: "email" | "phone" }> = {
  whatsapp: { color: "#22c97a", requires: "phone" },
  email: { color: "#4dabf7", requires: "email" },
  sms: { color: "#cc99ff", requires: "phone" },
};

const POLL_MS = 10000;

interface Props {
  channel: Channel;
  agentId: string;
}

export default function ChannelInboxPanel({ channel, agentId }: Props) {
  const meta = CHANNEL_META[channel] ?? CHANNEL_META.whatsapp;

  const [leads, setLeads] = useState<Lead[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, InboxItem["lastMessage"]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadInbox(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const [leadsRes, convosRes] = await Promise.all([
        fetch(`/api/leads?agentId=${agentId}`),
        fetch(`/api/conversations?agentId=${agentId}&channel=${channel}`),
      ]);
      const leadsData = await leadsRes.json();
      const convosData = await convosRes.json();

      const qualifying: Lead[] = (leadsData.leads ?? []).filter((l: Lead) =>
        meta.requires === "email" ? !!l.email : !!l.phone
      );

      const lastMsgMap: Record<string, InboxItem["lastMessage"]> = {};
      for (const convo of convosData ?? []) {
        const msgs = convo.messages ?? [];
        if (msgs.length > 0) lastMsgMap[convo.leadId] = msgs[msgs.length - 1];
      }

      setLeads(qualifying);
      setLastMessages(lastMsgMap);
    } catch {
      // silent — next poll will retry
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedLead(null);
    setSearch("");
    loadInbox(true);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadInbox(false), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, agentId]);

  const items: InboxItem[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? leads.filter((l) =>
          l.fullName.toLowerCase().includes(q) ||
          l.company?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q)
        )
      : leads;

    return filtered
      .map((lead) => ({ lead, lastMessage: lastMessages[lead._id] ?? null }))
      .sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
        if (ta !== tb) return tb - ta;
        return new Date(b.lead.createdAt).getTime() - new Date(a.lead.createdAt).getTime();
      });
  }, [leads, lastMessages, search]);

  return (
    <div className="flex flex-1 min-h-0">
      <InboxLeadList
        items={items}
        channel={channel}
        selectedLeadId={selectedLead?._id ?? null}
        onSelect={setSelectedLead}
        search={search}
        onSearchChange={setSearch}
        loading={loading}
        accentColor={meta.color}
        headerActions={channel === "email" ? (
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center justify-center gap-1.5 w-full rounded-lg text-[12px] font-semibold py-2 border-none cursor-pointer"
            style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff" }}
          >
            <IconPencilPlus size={14} /> Compose
          </button>
        ) : undefined}
      />

      <div className="flex-1 min-w-0">
        {selectedLead ? (
          <ChannelConversationThread
            key={selectedLead._id}
            lead={selectedLead}
            channel={channel}
            onSent={() => loadInbox(false)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <span className="flex items-center justify-center mb-3" style={{ width: 56, height: 56, borderRadius: 16, background: `${meta.color}14` }}>
              <IconInbox size={24} style={{ color: meta.color }} />
            </span>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text2)" }}>Select a conversation</p>
            <p className="text-[11.5px] mt-1 max-w-[260px]" style={{ color: "var(--color-text3)" }}>
              Pick a lead on the left to view and send messages.
            </p>
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeEmailModal
          leads={leads}
          agentId={agentId}
          onClose={() => setComposeOpen(false)}
          onSent={(lead) => { setComposeOpen(false); setSelectedLead(lead); loadInbox(false); }}
        />
      )}
    </div>
  );
}

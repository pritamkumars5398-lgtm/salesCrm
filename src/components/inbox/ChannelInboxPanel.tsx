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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadInbox(pageNum: number, showSpinner = false, query = debouncedSearch) {
    if (showSpinner) setLoading(true);
    if (pageNum > 1) setIsFetchingMore(true);
    try {
      const qParam = query ? `&q=${encodeURIComponent(query)}` : "";
      const reqContact = meta.requires;
      const [leadsRes, convosRes] = await Promise.all([
        fetch(`/api/leads?agentId=${agentId}&page=${pageNum}&limit=25&requireContact=${reqContact}${qParam}`),
        fetch(`/api/conversations?agentId=${agentId}&channel=${channel}`),
      ]);
      const leadsData = await leadsRes.json();
      const convosData = await convosRes.json();

      const newLeads: Lead[] = leadsData.leads ?? [];
      const totalPages = leadsData.totalPages ?? 1;

      setHasMore(pageNum < totalPages);

      setLeads((prev) => {
        if (pageNum === 1 && !showSpinner && prev.length > 0) {
          // Background poll: merge new leads at the front without destroying older loaded pages
          const prevMap = new Map(prev.map(l => [l._id, l]));
          newLeads.forEach(l => prevMap.set(l._id, l));
          return Array.from(prevMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        if (pageNum === 1) return newLeads;
        const existingIds = new Set(prev.map((l) => l._id));
        return [...prev, ...newLeads.filter((l) => !existingIds.has(l._id))];
      });

      const lastMsgMap: Record<string, InboxItem["lastMessage"]> = {};
      for (const convo of convosData ?? []) {
        const msgs = convo.messages ?? [];
        if (msgs.length > 0) lastMsgMap[convo.leadId] = msgs[msgs.length - 1];
      }
      setLastMessages(lastMsgMap);
    } catch {
      // silent — next poll will retry
    } finally {
      if (showSpinner) setLoading(false);
      if (pageNum > 1) setIsFetchingMore(false);
    }
  }

  useEffect(() => {
    setSelectedLead(null);
    setPage(1);
    loadInbox(1, true, debouncedSearch);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadInbox(1, false, debouncedSearch), POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, agentId, debouncedSearch]);

  const items: InboxItem[] = useMemo(() => {
    // We don't filter by search here anymore because it's done on the backend
    return leads
      .map((lead) => ({ lead, lastMessage: lastMessages[lead._id] ?? null }))
      .sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
        if (ta !== tb) return tb - ta;
        return new Date(b.lead.createdAt).getTime() - new Date(a.lead.createdAt).getTime();
      });
  }, [leads, lastMessages]);

  function handleLoadMore() {
    if (!loading && !isFetchingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadInbox(nextPage, false, debouncedSearch);
    }
  }

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
        isFetchingMore={isFetchingMore}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
        accentColor={meta.color}
        headerActions={channel === "email" ? (
          <button
            onClick={() => setComposeOpen(true)}
            className="flex items-center justify-center gap-1.5 w-full rounded-lg text-[12px] font-semibold py-2 border-none cursor-pointer"
            style={{ background: "linear-gradient(135deg, #df2a2a, #f24444)", color: "#fff" }}
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
            onSent={() => loadInbox(1, false, debouncedSearch)}
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
          onSent={(lead) => { setComposeOpen(false); setSelectedLead(lead); loadInbox(1, false, debouncedSearch); }}
        />
      )}
    </div>
  );
}

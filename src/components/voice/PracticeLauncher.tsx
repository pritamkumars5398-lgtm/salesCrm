"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconMicrophone } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import PracticeCallModal from "./PracticeCallModal";

/** Pick a lead (or none) and practice the exact phone conversation the AI would have with them. */
export default function PracticeLauncher() {
  const activeAgent = useAppStore((s) => s.activeAgent);
  const [leadId, setLeadId] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["practice-leads", activeAgent?._id],
    queryFn: () => fetch(`/api/leads?agentId=${activeAgent!._id}&page=1&limit=100`).then((r) => r.json()) as Promise<{ leads: { _id: string; fullName: string; company?: string }[] }>,
    enabled: !!activeAgent,
  });
  const leads = data?.leads ?? [];
  const chosen = leads.find((l) => l._id === leadId);

  return (
    <div className="mb-8 rounded-2xl border border-bg4 bg-bg2 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><IconMicrophone size={20} /></span>
        <div className="flex-1">
          <h3 className="text-[15px] font-bold text-text">Practice a call with your AI agent</h3>
          <p className="text-[12.5px] leading-relaxed text-text3">
            Play the lead and talk (or type) to the real agent — same greeting, pitch, knowledge base and lead history as a
            real call from <b>{activeAgent?.name}</b>. Nobody is dialed.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <select className="form-input min-w-[240px] flex-1" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
          <option value="">No specific lead (generic first call)</option>
          {leads.map((l) => <option key={l._id} value={l._id}>{l.fullName}{l.company && l.company !== l.fullName ? ` — ${l.company}` : ""}</option>)}
        </select>
        <button onClick={() => setOpen(true)} disabled={!activeAgent} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
          Start practice call
        </button>
      </div>
      {open && <PracticeCallModal leadId={leadId || null} leadName={chosen?.fullName || "Sample lead"} onClose={() => setOpen(false)} />}
    </div>
  );
}

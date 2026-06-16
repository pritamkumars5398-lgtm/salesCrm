"use client";
import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import Avatar from "@/components/ui/Avatar";
import StatusPill from "@/components/ui/Pill";

const STAGES = [
  { key: "new",       label: "New",       pillClass: "pill-gray" },
  { key: "contacted", label: "Contacted", pillClass: "pill-blue" },
  { key: "replied",   label: "Replied",   pillClass: "pill-amber" },
  { key: "qualified", label: "Qualified", pillClass: "pill-green" },
  { key: "closed",    label: "Closed",    pillClass: "pill-green" },
];

export default function CRM() {
  const { activeAgent, leads, setLeads, openDrawer, showToast } = useAppStore();

  useEffect(() => {
    if (!activeAgent) return;
    fetch(`/api/leads?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then(setLeads);
  }, [activeAgent?._id]);

  async function moveLead(leadId: string, stage: string) {
    await fetch(`/api/leads/${leadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStage: stage }),
    });
    showToast("Stage updated");
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-tight">
          CRM Pipeline{" "}
          <span className="text-[13px] font-normal" style={{ color: "var(--color-text3)" }}>
            Track leads through sales stages
          </span>
        </h1>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="grid gap-3 min-w-[1100px]" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          {STAGES.map(({ key, label, pillClass }) => {
            const stageLeads = leads.filter((l) => (l.pipelineStage ?? "new") === key);
            return (
              <div
                key={key}
                className="rounded-[14px] p-3 border min-w-0"
                style={{
                  background: "var(--color-bg2)",
                  borderColor: "rgba(0,0,0,0.1)",
                  minHeight: 300,
                }}
              >
                <div className="flex items-center justify-between mb-3 min-w-0">
                  <span className="text-[11px] font-semibold tracking-widest uppercase truncate" style={{ color: "var(--color-text3)" }}>
                    {label}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase border border-black/10 ${pillClass} text-[10px] flex-shrink-0`}>{stageLeads.length}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead._id}
                      className="p-3 rounded-[10px] border cursor-pointer transition-colors min-w-0"
                      style={{ background: "var(--color-bg3)", borderColor: "rgba(0,0,0,0.1)" }}
                      onClick={() => openDrawer(lead, "whatsapp")}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)")}
                    >
                      <div className="flex items-center gap-2 mb-1 min-w-0">
                        <Avatar name={lead.fullName} size={24} />
                        <div className="text-[13px] font-medium truncate" title={lead.fullName}>{lead.fullName}</div>
                      </div>
                      <div className="text-[11.5px] truncate" style={{ color: "var(--color-text3)" }} title={lead.company}>{lead.company}</div>
                      {lead.status === "meeting_booked" && (
                        <div className="mt-2"><span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase border border-emerald-500/20 bg-emerald-50 text-emerald-600 text-[10px]">Meeting booked</span></div>
                      )}
                      <select
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400 mt-2"
                        style={{ fontSize: 11, padding: "3px 6px" }}
                        value={lead.pipelineStage ?? "new"}
                        onChange={(e) => { e.stopPropagation(); moveLead(lead._id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

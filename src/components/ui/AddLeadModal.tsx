"use client";
import { useState } from "react";
import { IconX, IconUserPlus, IconPlayerPlay } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { Channel } from "@/store/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_FORM = {
  firstName: "", lastName: "", jobTitle: "", company: "",
  email: "", phone: "", source: "Manual",
  channels: [] as Channel[],
  website: "",
};

export default function AddLeadModal({ open, onClose }: Props) {
  const { activeAgent, addLead, showToast } = useAppStore();
  const [form, setForm] = useState(DEFAULT_FORM);

  if (!open) return null;

  function set(key: string, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  function toggleChannel(ch: Channel) {
    setForm((p) => ({
      ...p,
      channels: p.channels.includes(ch) ? p.channels.filter((c) => c !== ch) : [...p.channels, ch],
    }));
  }

  async function submit(startOutreach = false) {
    if (!activeAgent) return;
    const body = {
      ...form,
      agentId: activeAgent._id,
      status: startOutreach ? "in_outreach" : "new",
    };
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const lead = await res.json();
    addLead(lead);
    showToast(startOutreach ? "Lead added & outreach started!" : "Lead added!");
    setForm(DEFAULT_FORM);
    onClose();
  }

  const CHANNELS: Channel[] = ["email", "whatsapp", "sms", "call"];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-[14px] overflow-hidden border"
        style={{ background: "var(--color-bg2)", borderColor: "rgba(0,0,0,0.15)", width: 480, maxWidth: "95vw" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
          <span className="text-[14px] font-semibold">Add lead manually</span>
          <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-transparent border-none text-slate-500 hover:bg-slate-100 hover:text-slate-900 p-1" onClick={onClose}><IconX size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>First name</label>
              <input className="form-input" placeholder="Rahul" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Last name</label>
              <input className="form-input" placeholder="Sharma" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Job title</label>
              <input className="form-input" placeholder="CTO" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Company</label>
              <input className="form-input" placeholder="TechCorp India" value={form.company} onChange={(e) => set("company", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Email</label>
              <input className="form-input" type="email" placeholder="rahul@techcorp.in" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Website</label>
              <input className="form-input" placeholder="https://techcorp.in" value={form.website} onChange={(e) => set("website", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Phone / WhatsApp</label>
              <input className="form-input" placeholder="+91xxxxxxxxxx" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Source</label>
              <select className="form-input" value={form.source} onChange={(e) => set("source", e.target.value)}>
                {["Manual","LinkedIn","Google Maps","Apify","Referral"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Channels</label>
            <div className="flex gap-2">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors capitalize"
                  style={{
                    borderColor: form.channels.includes(ch) ? "#6c63ff" : "rgba(0,0,0,0.1)",
                    background: form.channels.includes(ch) ? "rgba(108,99,255,0.12)" : "var(--color-bg3)",
                    color: form.channels.includes(ch) ? "var(--color-accent2)" : "var(--color-text2)",
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
          <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 transition-all duration-200 ease-out hover:bg-slate-50" onClick={onClose}>Cancel</button>
          <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out" onClick={() => submit(false)}>
            <IconUserPlus size={14} /> Add lead
          </button>
          <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out" onClick={() => submit(true)}>
            <IconPlayerPlay size={14} /> Add & start outreach
          </button>
        </div>
      </div>
    </div>
  );
}

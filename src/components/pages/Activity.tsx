"use client";
import { useEffect, useState } from "react";
import { IconMail, IconBrandWhatsapp, IconMessage, IconPhone, IconActivity, IconCalendar } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { formatDistanceToNow } from "date-fns";

const CHANNEL_ICONS: Record<string, { Icon: React.ElementType; bg: string; color: string }> = {
  email:    { Icon: IconMail,           bg: "rgba(77,171,247,0.1)",  color: "#4dabf7" },
  whatsapp: { Icon: IconBrandWhatsapp,  bg: "rgba(34,201,122,0.1)",  color: "#22c97a" },
  sms:      { Icon: IconMessage,        bg: "rgba(204,153,255,0.1)", color: "#cc99ff" },
  call:     { Icon: IconPhone,          bg: "rgba(245,166,35,0.1)",  color: "#f5a623" },
  system:   { Icon: IconCalendar,       bg: "rgba(108,99,255,0.12)", color: "var(--color-accent2)" },
};

export default function Activity() {
  const { activeAgent, activities, setActivities } = useAppStore();
  const [channel, setChannel] = useState("all");
  const [range, setRange] = useState("today");

  useEffect(() => {
    if (!activeAgent) return;
    const params = new URLSearchParams({ agentId: activeAgent._id, channel, range });
    fetch(`/api/activities?${params}`)
      .then((r) => r.json())
      .then(setActivities);
  }, [activeAgent?._id, channel, range]);

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Activity log{" "}
          <span className="text-[13px] font-normal" style={{ color: "var(--color-text3)" }}>
            Everything the agent has done
          </span>
        </h1>
      </div>

      <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-[20px] mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/80 bg-white/50">
          <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-slate-800 tracking-tight">
            <IconActivity size={16} style={{ color: "var(--color-accent2)" }} /> Events
          </div>
          <div className="flex gap-2">
            <select className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400" style={{ width: "auto", padding: "5px 10px" }} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">All channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="call">Voice call</option>
            </select>
            <select className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400" style={{ width: "auto", padding: "5px 10px" }} value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
        <div style={{ padding: "8px 0" }}>
          {activities.length === 0 && (
            <p className="text-center py-10 text-[12px]" style={{ color: "var(--color-text3)" }}>No activity found</p>
          )}
          {activities.map((act) => {
            const cfg = CHANNEL_ICONS[act.channel] ?? CHANNEL_ICONS.system;
            return (
              <div
                key={act._id}
                className="flex items-start gap-3 px-4 py-3 mx-2 rounded-[10px] transition-colors hover:bg-white/[0.02]"
              >
                <div
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}
                >
                  <cfg.Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] leading-[1.5]">
                    {act.event} ·{" "}
                    <b className="font-medium" style={{ color: "var(--color-text)" }}>{act.leadName}</b>
                    {act.detail && (
                      <span className="text-[11.5px] block mt-0.5 truncate" style={{ color: "var(--color-text3)" }}>
                        {act.detail}
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] font-mono mt-0.5" style={{ color: "var(--color-text3)" }}>
                    {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

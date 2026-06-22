"use client";
import { useEffect, useState } from "react";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClock, IconPlus, IconPlug } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { format, startOfMonth, getDaysInMonth, getDay, isToday } from "date-fns";

export default function Calendar() {
  const { activeAgent, meetings, setMeetings, showToast } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [provider, setProvider] = useState("cal.com");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAgent) return;
    setLoading(true);
    fetch(`/api/meetings?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then(setMeetings)
      .finally(() => setLoading(false));
  }, [activeAgent?._id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <div className="text-[13px] font-semibold tracking-wide text-slate-400">Loading calendar...</div>
        </div>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(currentMonth);
  const startDay = getDay(startOfMonth(currentMonth));
  const meetingDays = new Set(
    meetings.map((m) => new Date(m.scheduledAt).getDate())
  );

  async function connectCalendar() {
    if (!activeAgent || !apiKey) return;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: activeAgent._id, settings: { calProvider: provider, calApiKey: apiKey } }),
    });
    showToast("Calendar connected");
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Calendar{" "}
          <span className="text-[13px] font-normal" style={{ color: "var(--color-text3)" }}>
            Meetings and scheduling
          </span>
        </h1>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "320px 1fr" }}>
        {/* Mini calendar + provider */}
        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-[20px] mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/80 bg-white/50">
            <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-slate-800 tracking-tight">
              <IconCalendar size={16} style={{ color: "var(--color-accent2)" }} />
              {format(currentMonth, "MMMM yyyy")}
            </div>
            <div className="flex gap-1.5">
              <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:bg-slate-50 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] !px-3 !py-[7px] !text-xs !rounded-lg !bg-transparent !border-transparent !text-slate-500 !shadow-none hover:!bg-slate-100 hover:!text-slate-900" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}>
                <IconChevronLeft size={14} />
              </button>
              <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:bg-slate-50 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] !px-3 !py-[7px] !text-xs !rounded-lg !bg-transparent !border-transparent !text-slate-500 !shadow-none hover:!bg-slate-100 hover:!text-slate-900" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}>
                <IconChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="px-5 py-5">
            <div className="grid grid-cols-7 gap-0.5 mb-2">
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
                <div key={d} className="text-center text-[11px] font-semibold py-1" style={{ color: "var(--color-text3)" }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: startDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                const hasEvent = meetingDays.has(day);
                const today = isToday(date);
                return (
                  <div
                    key={day}
                    className="text-center py-2 rounded-lg text-[12.5px] cursor-pointer relative transition-colors hover:bg-[var(--color-bg3)]"
                    style={today ? { background: "rgba(108,99,255,0.12)", color: "var(--color-accent2)", fontWeight: 600 } : {}}
                  >
                    {day}
                    {hasEvent && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: "#6c63ff" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Provider connect */}
            <div className="mt-4 pt-3.5 border-t" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
              <div className="text-[11px] font-semibold tracking-widest uppercase mb-2.5" style={{ color: "var(--color-text3)" }}>Provider</div>
              <select className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400 mb-2" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="cal.com">Cal.com</option>
                <option value="calendly">Calendly</option>
                <option value="google">Google Calendar</option>
              </select>
              <input className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400 mb-2" type="text" placeholder="API key or link" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out !px-3 !py-[7px] !text-xs !rounded-lg w-full justify-center" onClick={connectCalendar}>
                <IconPlug size={14} /> Connect
              </button>
            </div>
          </div>
        </div>

        {/* Upcoming meetings */}
        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-[20px] mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/80 bg-white/50">
            <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-slate-800 tracking-tight">
              <IconClock size={16} style={{ color: "var(--color-accent2)" }} /> Upcoming meetings
            </div>
            <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out !px-3 !py-[7px] !text-xs !rounded-lg"><IconPlus size={14} /> Book</button>
          </div>
          <div style={{ padding: 0 }}>
            {meetings.length === 0 && (
              <p className="text-center py-10 text-[12px]" style={{ color: "var(--color-text3)" }}>No meetings scheduled</p>
            )}
            {meetings.map((meeting, i) => (
              <div
                key={meeting._id}
                className="flex gap-3.5 px-[18px] py-3.5"
                style={{ borderBottom: i < meetings.length - 1 ? "1px solid rgba(0,0,0,0.1)" : "none" }}
              >
                <div className="text-[12px] font-mono min-w-[68px] flex-shrink-0" style={{ color: "var(--color-text3)" }}>
                  {format(new Date(meeting.scheduledAt), "MMM d")}<br />
                  {format(new Date(meeting.scheduledAt), "h:mm a")}
                </div>
                <div>
                  <div className="text-[13.5px] font-medium">{meeting.title}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--color-text3)" }}>
                    {meeting.company} · {meeting.durationMinutes} min · {meeting.platform}
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase shadow-sm border border-black/5 ${meeting.status === "confirmed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"} text-[10px]`}>
                      {meeting.status === "confirmed" ? "Confirmed" : "Pending confirm"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

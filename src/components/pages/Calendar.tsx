"use client";
import { useEffect, useState } from "react";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconClock, IconPlus, IconExternalLink, IconCopy } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, getDaysInMonth, getDay, isToday } from "date-fns";

export default function Calendar() {
  const { activeAgent, meetings, setMeetings, showToast } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // Meeting booking is set up by the admin; this page only shows its status and booking link.
  const [booking, setBooking] = useState<{ state: string; message: string; link?: string } | null>(null);
  useEffect(() => {
    if (!activeAgent) return;
    setBooking(null);
    fetch(`/api/channels?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then((d) => {
        const c = (d.channels ?? []).find((x: { key: string }) => x.key === "calendly");
        setBooking(c ? { state: c.state, message: c.message, link: c.details?.find((x: { label: string }) => x.label === "Booking link")?.value } : { state: "not_set_up", message: "" });
      })
      .catch(() => setBooking({ state: "not_set_up", message: "" }));
  }, [activeAgent?._id]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ["meetings", activeAgent?._id],
    queryFn: () => fetch(`/api/meetings?agentId=${activeAgent!._id}`).then((r) => r.json()),
    enabled: !!activeAgent,
  });
  useEffect(() => { if (data) setMeetings(data); }, [data, setMeetings]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <div className="text-[13px] font-semibold tracking-wide text-text3">Loading calendar...</div>
        </div>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(currentMonth);
  const startDay = getDay(startOfMonth(currentMonth));
  const meetingDays = new Set(
    meetings.map((m) => new Date(m.scheduledAt).getDate())
  );

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
        <div className="bg-bg2 backdrop-blur-md border border-bg4 rounded-[20px] mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-bg4 bg-bg2">
            <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-text tracking-tight">
              <IconCalendar size={16} style={{ color: "var(--color-accent2)" }} />
              {format(currentMonth, "MMMM yyyy")}
            </div>
            <div className="flex gap-1.5">
              <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-bg2 text-text2 shadow-sm transition-all duration-200 ease-out hover:bg-bg3 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] !px-3 !py-[7px] !text-xs !rounded-lg !bg-transparent !border-transparent !text-text3 !shadow-none hover:!bg-bg3 hover:!text-text" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}>
                <IconChevronLeft size={14} />
              </button>
              <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-bg2 text-text2 shadow-sm transition-all duration-200 ease-out hover:bg-bg3 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] !px-3 !py-[7px] !text-xs !rounded-lg !bg-transparent !border-transparent !text-text3 !shadow-none hover:!bg-bg3 hover:!text-text" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}>
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
                    style={today ? { background: "rgba(223,42,42,0.12)", color: "var(--color-accent2)", fontWeight: 600 } : {}}
                  >
                    {day}
                    {hasEvent && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: "#6c63ff" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Meeting booking — set up by the admin; the customer only sees status and the link */}
            <div className="mt-4 pt-3.5 border-t" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
              <div className="text-[11px] font-semibold tracking-widest uppercase mb-2.5" style={{ color: "var(--color-text3)" }}>Meeting booking</div>
              {booking === null ? (
                <p className="text-[12.5px] m-0" style={{ color: "var(--color-text3)" }}>Checking…</p>
              ) : booking.state === "not_set_up" ? (
                <p className="text-[12.5px] m-0" style={{ color: "var(--color-text3)" }}>Not set up yet — your admin will set this up.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-[12.5px] font-semibold" style={{ color: booking.state === "active" ? "#10b981" : "#f59e0b" }}>{booking.message}</span>
                  {booking.link && (
                    <div className="flex gap-1.5">
                      <a href={booking.link} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-[7px] rounded-lg text-xs font-semibold bg-bg3 border border-bg4 text-text no-underline">
                        <IconExternalLink size={13} /> Open
                      </a>
                      <button
                        type="button"
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-[7px] rounded-lg text-xs font-semibold bg-bg3 border border-bg4 text-text cursor-pointer"
                        onClick={() => navigator.clipboard?.writeText(booking.link!).then(() => showToast("Booking link copied"), () => showToast("Couldn't copy", "error"))}
                      >
                        <IconCopy size={13} /> Copy link
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upcoming meetings */}
        <div className="bg-bg2 backdrop-blur-md border border-bg4 rounded-[20px] mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-bg4 bg-bg2">
            <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-text tracking-tight">
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

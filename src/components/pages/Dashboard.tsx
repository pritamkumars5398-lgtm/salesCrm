"use client";
import { useEffect } from "react";
import { IconUsers, IconActivity, IconMail, IconBrandWhatsapp, IconPhone } from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import Avatar from "@/components/ui/Avatar";
import StatusPill from "@/components/ui/Pill";
import { formatDistanceToNow } from "date-fns";

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: IconMail, whatsapp: IconBrandWhatsapp, sms: IconMail, call: IconPhone,
};
const CHANNEL_STYLE: Record<string, { bg: string; color: string }> = {
  email:    { bg: "rgba(77,171,247,0.1)",  color: "#4dabf7" },
  whatsapp: { bg: "rgba(34,201,122,0.1)",  color: "#22c97a" },
  sms:      { bg: "rgba(204,153,255,0.1)", color: "#cc99ff" },
  call:     { bg: "rgba(245,166,35,0.1)",  color: "#f5a623" },
  system:   { bg: "rgba(108,99,255,0.12)", color: "var(--color-accent2)" },
};

export default function Dashboard() {
  const {
    activeAgent, dashboardStats, dashboardRecentLeads,
    dashboardRecentActivity, setDashboard, setLoading, openDrawer, setPage,
  } = useAppStore();

  useEffect(() => {
    if (!activeAgent) return;
    setLoading("dashboard", true);
    fetch(`/api/dashboard?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then(setDashboard)
      .finally(() => setLoading("dashboard", false));
  }, [activeAgent?._id]);

  const stats = dashboardStats;

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Dashboard{" "}
          <span className="text-[13px] font-normal" style={{ color: "var(--color-text3)" }}>
            Overview of all activity
          </span>
        </h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total leads",      val: stats?.totalLeads ?? 0,        sub: "+12 today" },
          { label: "In outreach",      val: stats?.inOutreach ?? 0,        sub: `${stats ? Math.round((stats.inOutreach / (stats.totalLeads || 1)) * 100) : 0}% of leads` },
          { label: "Replied",          val: stats?.replied ?? 0,           sub: "reply rate" },
          { label: "Meetings booked",  val: stats?.meetingsThisWeek ?? 0,  sub: "this week" },
        ].map(({ label, val, sub }) => (
          <div
            key={label}
            className="rounded-[20px] p-5 bg-white/80 backdrop-blur-md border border-slate-200"
          >
            <div className="text-[11.5px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--color-text3)" }}>
              {label}
            </div>
            <div className="text-[32px] font-bold tracking-tight text-slate-800">{val}</div>
            <div className="text-[12px] font-medium mt-1" style={{ color: "var(--color-text3)" }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Recent leads */}
        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-[20px] mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/80 bg-white/50">
            <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-slate-800 tracking-tight">
              <IconUsers size={16} style={{ color: "var(--color-accent2)" }} />
              Recent leads
            </div>
            <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:bg-slate-50 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] !px-3 !py-[7px] !text-xs !rounded-lg !bg-transparent !border-transparent !text-slate-500 !shadow-none hover:!bg-slate-100 hover:!text-slate-900" onClick={() => setPage("leads")}>
              View all →
            </button>
          </div>
          <div style={{ padding: 0 }}>
            {dashboardRecentLeads.length === 0 && (
              <p className="text-center py-8 text-[12px]" style={{ color: "var(--color-text3)" }}>
                No leads yet. Add your first lead.
              </p>
            )}
            {dashboardRecentLeads.map((lead, i) => (
              <div
                key={lead._id}
                className="flex items-center justify-between px-[18px] py-3 cursor-pointer transition-colors hover:bg-white/[0.02]"
                style={{ borderBottom: i < dashboardRecentLeads.length - 1 ? "1px solid rgba(0,0,0,0.1)" : "none" }}
                onClick={() => openDrawer(lead, "whatsapp")}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={lead.fullName} />
                  <div>
                    <div className="text-[13.5px] font-medium">{lead.fullName}</div>
                    <div className="text-[11.5px]" style={{ color: "var(--color-text3)" }}>
                      {lead.jobTitle} · {lead.company}
                    </div>
                  </div>
                </div>
                <StatusPill status={lead.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Live activity */}
        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-[20px] mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/80 bg-white/50">
            <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-slate-800 tracking-tight">
              <IconActivity size={16} style={{ color: "var(--color-accent2)" }} />
              Live activity
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase shadow-sm border border-black/5 bg-emerald-50 text-emerald-600 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#22c97a" }} />
              Live
            </span>
          </div>
          <div style={{ padding: "8px 0" }}>
            {dashboardRecentActivity.length === 0 && (
              <p className="text-center py-6 text-[12px]" style={{ color: "var(--color-text3)" }}>
                No activity yet
              </p>
            )}
            {dashboardRecentActivity.map((act) => {
              const style = CHANNEL_STYLE[act.channel] ?? CHANNEL_STYLE.system;
              const Icon = CHANNEL_ICONS[act.channel] ?? IconActivity;
              return (
                <div
                  key={act._id}
                  className="flex items-start gap-3 px-4 py-3 rounded-[10px] transition-colors hover:bg-white/[0.02] mx-2"
                >
                  <div
                    className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                    style={{ background: style.bg, color: style.color }}
                  >
                    <Icon size={15} />
                  </div>
                  <div>
                    <div className="text-[13px] leading-[1.5]">
                      {act.event} · <b className="font-medium" style={{ color: "var(--color-text)" }}>{act.leadName}</b>
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
    </div>
  );
}

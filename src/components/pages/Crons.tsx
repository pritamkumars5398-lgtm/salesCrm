"use client";
import { useEffect, useState } from "react";
import {
  IconClock, IconPlus, IconTrash, IconToggleRight, IconToggleLeft,
  IconPlayerPlay, IconRefresh, IconMail, IconRobot, IconChartBar,
} from "@tabler/icons-react";
import { useAppStore } from "@/store/useAppStore";
import type { CronJob } from "@/store/types";
import { CRON_PRESETS } from "@/constants/theme";
import { formatDistanceToNow } from "date-fns";

const ACTION_OPTIONS = [
  { value: "start_outreach", label: "Start outreach",  Icon: IconPlayerPlay, color: "#22c97a" },
  { value: "sync_apify",     label: "Sync Apify",      Icon: IconRefresh,    color: "#4dabf7" },
  { value: "send_report",    label: "Send report",     Icon: IconMail,       color: "#f5a623" },
  { value: "pause_agent",    label: "Pause agent",     Icon: IconRobot,      color: "#ff6b6b" },
  { value: "resume_agent",   label: "Resume agent",    Icon: IconRobot,      color: "#22c97a" },
];

function getActionCfg(action: string) {
  return ACTION_OPTIONS.find((a) => a.value === action) ?? ACTION_OPTIONS[0];
}

export default function Crons() {
  const { activeAgent, cronJobs, setCronJobs, addCronJob, updateCronJob, removeCronJob, showToast } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    cronPreset: "0 9 * * 1-5",
    customCron: "",
    action: "start_outreach",
  });
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAgent) return;
    setLoading(true);
    fetch(`/api/crons?agentId=${activeAgent._id}`)
      .then((r) => r.json())
      .then(setCronJobs)
      .finally(() => setLoading(false));
  }, [activeAgent?._id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <div className="text-[13px] font-semibold tracking-wide text-slate-400">Loading schedules...</div>
        </div>
      </div>
    );
  }

  async function createJob() {
    if (!activeAgent || !form.name.trim()) return;
    const cronExpression = isCustom ? form.customCron : form.cronPreset;
    if (!cronExpression.trim()) return;

    const res = await fetch("/api/crons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: activeAgent._id,
        name: form.name.trim(),
        cronExpression,
        action: form.action,
        enabled: true,
      }),
    });
    const job = await res.json();
    addCronJob(job);
    setShowForm(false);
    setForm({ name: "", cronPreset: "0 9 * * 1-5", customCron: "", action: "start_outreach" });
    showToast("Schedule created");
  }

  async function toggleJob(job: CronJob) {
    await fetch(`/api/crons/${job._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    updateCronJob(job._id, { enabled: !job.enabled });
    showToast(job.enabled ? "Schedule paused" : "Schedule enabled");
  }

  async function deleteJob(job: CronJob) {
    await fetch(`/api/crons/${job._id}`, { method: "DELETE" });
    removeCronJob(job._id);
    showToast("Schedule deleted");
  }

  function describeExpression(expr: string): string {
    const preset = CRON_PRESETS.find((p) => p.value === expr);
    if (preset && preset.value !== "custom") return preset.label;
    return `Cron: ${expr}`;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Schedules{" "}
          <span className="text-[13px] font-normal" style={{ color: "var(--color-text3)" }}>
            Automate agent actions on a cron schedule
          </span>
        </h1>
        <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out" onClick={() => setShowForm((v) => !v)}>
          <IconPlus size={15} /> New schedule
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div
          className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-[20px] mb-4 overflow-hidden mb-4"
          style={{ borderColor: "rgba(108,99,255,0.25)", background: "rgba(108,99,255,0.04)" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/80 bg-white/50">
            <div className="text-[14.5px] font-bold flex items-center gap-2.5 text-slate-800 tracking-tight"><IconClock size={16} style={{ color: "var(--color-accent2)" }} /> New schedule</div>
          </div>
          <div className="px-5 py-5 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Name</label>
              <input
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400"
                placeholder="e.g. Daily morning outreach"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Action</label>
              <select
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400"
                value={form.action}
                onChange={(e) => setForm((p) => ({ ...p, action: e.target.value }))}
              >
                {ACTION_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[11.5px] font-medium" style={{ color: "var(--color-text2)" }}>Schedule</label>
              <div className="flex gap-2">
                <select
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400"
                  value={form.cronPreset}
                  onChange={(e) => {
                    if (e.target.value === "custom") { setIsCustom(true); }
                    else { setIsCustom(false); setForm((p) => ({ ...p, cronPreset: e.target.value })); }
                  }}
                  style={{ flex: 1 }}
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                {isCustom && (
                  <input
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600 placeholder:text-slate-400 font-mono"
                    placeholder="* * * * *"
                    value={form.customCron}
                    onChange={(e) => setForm((p) => ({ ...p, customCron: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                )}
              </div>
              <p className="text-[11.5px]" style={{ color: "var(--color-text3)" }}>
                Format: minute hour day-of-month month day-of-week
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-[18px] pb-4">
            <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 transition-all duration-200 ease-out hover:bg-slate-50 !px-3 !py-[7px] !text-xs !rounded-lg" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold bg-gradient-to-br from-indigo-600 to-indigo-500 !border-none !text-white hover:brightness-105 transition-all duration-200 ease-out !px-3 !py-[7px] !text-xs !rounded-lg" onClick={createJob}>
              <IconClock size={14} /> Create schedule
            </button>
          </div>
        </div>
      )}

      {/* Jobs list */}
      {cronJobs.length === 0 && !showForm && (
        <div
          className="text-center py-16 rounded-[14px] border"
          style={{ background: "var(--color-bg2)", borderColor: "rgba(0,0,0,0.1)" }}
        >
          <IconClock size={36} className="mx-auto mb-3" style={{ color: "var(--color-text3)" }} />
          <p className="text-[14px] font-medium mb-1">No schedules yet</p>
          <p className="text-[12px]" style={{ color: "var(--color-text3)" }}>
            Create a schedule to automate your agent — e.g. start outreach every weekday at 9 AM.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {cronJobs.map((job) => {
          const actionCfg = getActionCfg(job.action);
          return (
            <div
              key={job._id}
              className="rounded-[14px] border p-4 flex items-center gap-4 transition-colors"
              style={{
                background: "var(--color-bg2)",
                borderColor: job.enabled ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.05)",
                opacity: job.enabled ? 1 : 0.6,
              }}
            >
              {/* Action icon */}
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
                style={{ background: `${actionCfg.color}15`, color: actionCfg.color }}
              >
                <actionCfg.Icon size={18} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13.5px] font-semibold">{job.name}</span>
                  {!job.enabled && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase border border-slate-200 bg-slate-50 text-slate-600 text-[10px]">Paused</span>
                  )}
                  {job.enabled && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold tracking-wide uppercase border border-emerald-500/20 bg-emerald-50 text-emerald-600 text-[10px]">Active</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--color-text3)" }}>
                  <span className="font-mono">{describeExpression(job.cronExpression)}</span>
                  <span>·</span>
                  <span>{actionCfg.label}</span>
                  {job.lastRunAt && (
                    <>
                      <span>·</span>
                      <span>Last run {formatDistanceToNow(new Date(job.lastRunAt), { addSuffix: true })}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1 text-[11.5px] font-mono mb-0.5" style={{ color: "var(--color-text3)" }}>
                  <IconChartBar size={12} />
                  {job.runCount} run{job.runCount !== 1 ? "s" : ""}
                </div>
                <div className="text-[11px]" style={{ color: "var(--color-text3)" }}>
                  {job.cronExpression}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleJob(job)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:bg-slate-50 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] !px-3 !py-[7px] !text-xs !rounded-lg !bg-transparent !border-transparent !text-slate-500 !shadow-none hover:!bg-slate-100 hover:!text-slate-900 flex items-center gap-1.5"
                  style={{ color: job.enabled ? "#22c97a" : "var(--color-text3)" }}
                >
                  {job.enabled ? <IconToggleRight size={16} /> : <IconToggleLeft size={16} />}
                  {job.enabled ? "On" : "Off"}
                </button>
                <button
                  onClick={() => deleteJob(job)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-[9px] rounded-xl text-[13px] font-semibold border border-black/5 bg-white text-slate-700 shadow-sm transition-all duration-200 ease-out hover:bg-slate-50 hover:-translate-y-[1px] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] active:translate-y-[1px] active:shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] !px-3 !py-[7px] !text-xs !rounded-lg !bg-transparent !border-transparent !text-slate-500 !shadow-none hover:!bg-slate-100 hover:!text-slate-900"
                  style={{ color: "#ff6b6b" }}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

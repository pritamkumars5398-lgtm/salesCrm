"use client";
import { useMemo } from "react";
import cronstrue from "cronstrue";

/**
 * Friendly schedule picker that emits a standard 5-field cron string.
 * Lets users choose frequency + time (+ weekday / day-of-month) instead of
 * typing raw cron, while still allowing a Custom raw-cron escape hatch.
 */

export type Frequency = "daily" | "weekdays" | "weekly" | "monthly" | "custom";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parse "HH:MM" → [minute, hour] as strings, defaulting to 09:00. */
function parseTime(time: string): [string, string] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return ["0", "9"];
  const hour = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return [String(min), String(hour)];
}

export function buildCron(opts: {
  frequency: Frequency;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
  customCron: string;
}): string {
  const { frequency, time, weekdays, dayOfMonth, customCron } = opts;
  if (frequency === "custom") return customCron.trim();
  const [min, hour] = parseTime(time);
  switch (frequency) {
    case "daily":    return `${min} ${hour} * * *`;
    case "weekdays": return `${min} ${hour} * * 1-5`;
    case "weekly": {
      const days = weekdays.length ? [...weekdays].sort((a, b) => a - b).join(",") : "*";
      return `${min} ${hour} * * ${days}`;
    }
    case "monthly":  return `${min} ${hour} ${Math.min(31, Math.max(1, dayOfMonth))} * *`;
    default:         return `${min} ${hour} * * *`;
  }
}

/** Best-effort: derive friendly controls from an existing cron string (for edit). */
export function parseCron(expr: string): {
  frequency: Frequency;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
} {
  const parts = expr.trim().split(/\s+/);
  const fallback = { frequency: "custom" as Frequency, time: "09:00", weekdays: [] as number[], dayOfMonth: 1 };
  if (parts.length !== 5) return fallback;
  const [min, hour, dom, mon, dow] = parts;
  // Only map cleanly when minute/hour are simple numbers and month is wildcard.
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour) || mon !== "*") return fallback;
  const time = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;

  if (dom === "*" && dow === "*") return { frequency: "daily", time, weekdays: [], dayOfMonth: 1 };
  if (dom === "*" && dow === "1-5") return { frequency: "weekdays", time, weekdays: [], dayOfMonth: 1 };
  if (dom === "*" && /^(\d)(,\d)*$/.test(dow)) {
    return { frequency: "weekly", time, weekdays: dow.split(",").map(Number), dayOfMonth: 1 };
  }
  if (/^\d{1,2}$/.test(dom) && dow === "*") {
    return { frequency: "monthly", time, weekdays: [], dayOfMonth: parseInt(dom, 10) };
  }
  return fallback;
}

export function describeCron(expr: string): string {
  try {
    return cronstrue.toString(expr, { verbose: false, use24HourTimeFormat: false });
  } catch {
    return "Enter a valid cron expression";
  }
}

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays (Mon–Fri)" },
  { value: "weekly", label: "Specific days" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom (cron)" },
];

export interface ScheduleState {
  frequency: Frequency;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
  customCron: string;
}

const selectCls =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-[13.5px] outline-none transition-all duration-200 focus:border-indigo-600";

export default function ScheduleBuilder({
  state,
  onChange,
}: {
  state: ScheduleState;
  onChange: (next: ScheduleState) => void;
}) {
  const cron = useMemo(() => buildCron(state), [state]);
  const set = (patch: Partial<ScheduleState>) => onChange({ ...state, ...patch });

  const toggleDay = (d: number) =>
    set({ weekdays: state.weekdays.includes(d) ? state.weekdays.filter((x) => x !== d) : [...state.weekdays, d] });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <select
          className={selectCls}
          style={{ flex: "1 1 180px" }}
          value={state.frequency}
          onChange={(e) => set({ frequency: e.target.value as Frequency })}
        >
          {FREQ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {state.frequency !== "custom" && (
          <input
            type="time"
            className={selectCls}
            style={{ flex: "1 1 130px" }}
            value={state.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        )}
      </div>

      {state.frequency === "weekly" && (
        <div className="flex flex-wrap gap-1.5">
          {DOW_LABELS.map((label, d) => {
            const active = state.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border transition-all"
                style={{
                  background: active ? "rgba(99,102,241,0.12)" : "#fff",
                  borderColor: active ? "#6366f1" : "#e2e8f0",
                  color: active ? "#4f46e5" : "#64748b",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {state.frequency === "monthly" && (
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-slate-500">On day</span>
          <input
            type="number"
            min={1}
            max={31}
            className={selectCls}
            style={{ width: 90 }}
            value={state.dayOfMonth}
            onChange={(e) => set({ dayOfMonth: Math.min(31, Math.max(1, parseInt(e.target.value || "1", 10))) })}
          />
          <span className="text-[12.5px] text-slate-500">of each month</span>
        </div>
      )}

      {state.frequency === "custom" && (
        <input
          className={`${selectCls} font-mono placeholder:text-slate-400`}
          placeholder="* * * * *"
          value={state.customCron}
          onChange={(e) => set({ customCron: e.target.value })}
        />
      )}

      {/* Live preview */}
      <p className="text-[11.5px]" style={{ color: "var(--color-text3)" }}>
        {state.frequency === "weekly" && state.weekdays.length === 0
          ? "Pick at least one day."
          : <>Runs: <span className="font-medium text-slate-600">{describeCron(cron)}</span> <span className="font-mono text-slate-400">({cron})</span></>}
      </p>
    </div>
  );
}

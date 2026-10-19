"use client";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  nextRunAt: string;
  enabled: boolean;
  /** schedules only fire while the workspace is published (resume_agent excepted) */
  willFire: boolean;
  /** something is calling /api/crons/execute — without it nothing ever fires */
  schedulerAlive: boolean;
  /** called (at most every 10 s) once the run time has passed, to pick up the result */
  onDue: () => void;
}

const LIVE_WINDOW_MS = 60 * 60 * 1000;

/** "12m 34s", or "42s" in the last minute — explicit units so it isn't read as a clock time. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** "Next: in 3 hours", then a live mm:ss countdown in the last hour, then "Running now…". */
export default function NextRunCountdown({ nextRunAt, enabled, willFire, schedulerAlive, onDue }: Props) {
  const target = new Date(nextRunAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const lastPoll = useRef(0);
  const remaining = target - now;
  const live = enabled && willFire && remaining <= LIVE_WINDOW_MS;

  useEffect(() => {
    if (!live) {
      // Re-check once a minute so the card switches to the live countdown on time.
      const id = setInterval(() => setNow(Date.now()), 60000);
      return () => clearInterval(id);
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (remaining > 0 || !live) return;
    if (Date.now() - lastPoll.current < 10000) return;
    lastPoll.current = Date.now();
    onDue();
  }, [remaining, live, onDue]);

  const at = new Date(target).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" });

  if (!enabled) return <span style={{ color: "var(--color-text3)" }}>Off — won&apos;t run</span>;
  if (!willFire) {
    return <span style={{ color: "#f59e0b" }} title="Publish the workspace for schedules to run">Next: {at} — paused (workspace is in Draft)</span>;
  }
  // The scheduler ticks every 60s, so a due run starts within ~1 minute. Much later than that means nobody is triggering it.
  if (remaining <= -90000 && !schedulerAlive) {
    return (
      <span className="font-semibold" style={{ color: "#ef4444" }} title="server.js runs due schedules every minute — it isn't running (or is an old version).">
        Didn&apos;t run — the scheduler isn&apos;t running. Restart the server (npm run dev:ngrok).
      </span>
    );
  }
  if (remaining <= -5 * 60000) {
    return <span className="font-semibold" style={{ color: "#ef4444" }}>Overdue since {at} — check the server log for errors</span>;
  }
  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "#f59e0b" }}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#f59e0b" }} />
        Running now…
      </span>
    );
  }
  if (live) {
    const soon = remaining <= 60000;
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: soon ? "#f59e0b" : "#22c97a" }} title={`Runs at ${at}`}>
        {soon && <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#f59e0b" }} />}
        Runs in <span className="font-mono tabular-nums">{countdown(remaining)}</span>
        <span className="font-normal opacity-70">({at})</span>
      </span>
    );
  }
  return (
    <span style={{ color: "#22c97a" }} title={new Date(target).toLocaleString("en-IN")}>
      Next: {formatDistanceToNow(new Date(target), { addSuffix: true })} ({at})
    </span>
  );
}

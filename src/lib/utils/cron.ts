/** Compute the next UTC date a cron expression will fire after `now`. */
export function computeNextRun(expression: string, from: Date = new Date()): Date {
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) throw new Error("bad length");

    const [minStr, hourStr, , , dowStr] = parts;
    const next = new Date(from);
    next.setSeconds(0, 0);

    const min = minStr === "*" ? 0 : parseInt(minStr, 10);

    if (hourStr === "*") {
      // Every hour at :MM
      next.setMinutes(min, 0, 0);
      if (next <= from) next.setTime(next.getTime() + 60 * 60 * 1000);
      return next;
    }

    if (hourStr.startsWith("*/")) {
      // Every N hours
      const interval = parseInt(hourStr.slice(2), 10);
      for (let h = from.getHours(); h < 48; h++) {
        if (h % interval === 0) {
          const candidate = new Date(from);
          candidate.setHours(h % 24, min, 0, 0);
          if (h >= 24) candidate.setDate(candidate.getDate() + Math.floor(h / 24));
          if (candidate > from) return candidate;
        }
      }
      // Fallback: next day
      next.setDate(next.getDate() + 1);
      next.setHours(0, min, 0, 0);
      return next;
    }

    // Fixed hour
    const hour = parseInt(hourStr, 10);
    next.setHours(hour, min, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);

    // Filter by day-of-week
    if (dowStr !== "*") {
      const allowed = expandDOW(dowStr);
      for (let i = 0; i < 7; i++) {
        if (allowed.includes(next.getDay())) break;
        next.setDate(next.getDate() + 1);
      }
    }

    return next;
  } catch {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
}

function expandDOW(str: string): number[] {
  if (str.includes("-")) {
    const [a, b] = str.split("-").map(Number);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return str.split(",").map(Number);
}

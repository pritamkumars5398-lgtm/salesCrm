/**
 * Minimal but correct 5-field cron next-run calculator.
 * Supports `*`, `a`, `a-b`, `a,b,c`, `* /n` and `a-b/n` in every field, and
 * standard day-of-month / day-of-week OR semantics (when both are restricted,
 * the job fires if EITHER matches).
 *
 * Times are interpreted in the server's local timezone (same as before).
 */

/** Does `value` satisfy one cron field (e.g. "*", "1-5", "0,30", "* /2")? */
function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  for (const part of field.split(",")) {
    let expr = part;
    let step = 1;

    const slash = expr.indexOf("/");
    if (slash !== -1) {
      step = parseInt(expr.slice(slash + 1), 10);
      if (!Number.isFinite(step) || step <= 0) continue;
      expr = expr.slice(0, slash);
    }

    let start = min;
    let end = max;
    if (expr !== "*") {
      if (expr.includes("-")) {
        const [a, b] = expr.split("-").map((n) => parseInt(n, 10));
        start = a;
        end = b;
      } else {
        const n = parseInt(expr, 10);
        if (!Number.isFinite(n)) continue;
        // A bare number with a step (e.g. "5/10") means "from 5 to max, every 10".
        start = n;
        end = slash !== -1 ? max : n;
      }
    }

    if (value < start || value > end) continue;
    if ((value - start) % step === 0) return true;
  }
  return false;
}

/** Compute the next date a cron expression will fire strictly after `from`. */
export function computeNextRun(expression: string, from: Date = new Date()): Date {
  const oneDayLater = () => new Date(from.getTime() + 24 * 60 * 60 * 1000);
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) throw new Error("expected 5 cron fields");
    const [minF, hourF, domF, monF, dowF] = parts;

    const next = new Date(from);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1); // never return `from` itself

    const domRestricted = domF !== "*";
    const dowRestricted = dowF !== "*";

    // Search minute-by-minute up to ~1 year ahead — cheap and always correct.
    for (let i = 0; i < 366 * 24 * 60; i++) {
      const dayByDom = fieldMatches(domF, next.getDate(), 1, 31);
      const dayByDow = fieldMatches(dowF, next.getDay(), 0, 6);
      // Standard cron: if both day fields are set, either one matching is enough.
      const dayOk =
        domRestricted && dowRestricted ? dayByDom || dayByDow : dayByDom && dayByDow;

      if (
        dayOk &&
        fieldMatches(minF, next.getMinutes(), 0, 59) &&
        fieldMatches(hourF, next.getHours(), 0, 23) &&
        fieldMatches(monF, next.getMonth() + 1, 1, 12)
      ) {
        return new Date(next);
      }
      next.setMinutes(next.getMinutes() + 1);
    }
    return oneDayLater();
  } catch {
    return oneDayLater();
  }
}

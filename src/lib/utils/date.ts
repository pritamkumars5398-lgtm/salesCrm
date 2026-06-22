const LOCALE = "en-IN";

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

export function formatMonth(iso?: string): string {
  return new Date(iso ?? Date.now()).toLocaleString(LOCALE, { month: "long", year: "numeric" });
}

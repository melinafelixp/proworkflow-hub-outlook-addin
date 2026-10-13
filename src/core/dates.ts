/** Date helpers. All display uses the user's local time zone. */

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const DAY = 24 * 60 * 60 * 1000;

function time(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "9:36 AM" today, "Yesterday", "Tuesday" this week, otherwise "Oct 7" (with the year when it differs). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days <= 0) return time(d);
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

/** "October 7 · 9:15 AM" */
export function formatFull(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  const date = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: sameYear ? undefined : "numeric" });
  return `${date} · ${time(d)}`;
}

export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY).toISOString();
}

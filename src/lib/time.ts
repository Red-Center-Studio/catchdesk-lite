/**
 * Dates and times in the business's own time zone. Stored timestamps are UTC ISO strings; booked visits are local
 * "YYYY-MM-DDTHH:MM" values, because "9am on Tuesday" means 9am where the business is.
 */

/** True for an IANA time zone name this runtime understands, such as America/Chicago. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone to use: the Settings value when valid, then the wrangler.jsonc value, then UTC. */
export function pickZone(settingsZone: string, envZone: string | undefined): string {
  if (isValidTimeZone(settingsZone)) return settingsZone;
  if (envZone && isValidTimeZone(envZone)) return envZone;
  return "UTC";
}

/** "Mar 12, 2027, 9:30 AM" in the given zone. */
export function formatWhen(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(d);
}

/** "Mar 12, 2027" for a YYYY-MM-DD value. */
export function formatDay(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    d,
  );
}

/** "Tue, Mar 12, 9:30 AM" for a local "YYYY-MM-DDTHH:MM" value. */
export function formatLocal(local: string | null | undefined): string {
  if (!local || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return "";
  const d = new Date(`${local}:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

/** The local calendar day (YYYY-MM-DD) of an instant in a zone. */
export function ymdInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Adds whole days to a YYYY-MM-DD value. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "5 minutes ago", "3 hours ago", "2 days ago": short and good enough for an inbox. */
export function ago(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Times are stored in UTC and shown/entered in India Standard Time (UTC+05:30, no DST).

export const IST_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Converts an IST wall-clock value from <input type="datetime-local"> ("2026-10-23T20:00")
 * to the UTC instant it represents.
 */
export function istLocalToUtc(local: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) throw new Error(`Invalid date-time: "${local}"`);
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  const check = new Date(asUtc);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) {
    throw new Error(`Invalid date-time: "${local}"`);
  }
  return new Date(asUtc - IST_OFFSET_MS);
}

/** The IST wall-clock value for a UTC instant, formatted for <input type="datetime-local">. */
export function utcToIstLocal(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

/** The UTC instant an IST calendar day begins, from <input type="date"> ("2026-10-25"). */
export function istDateToUtc(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: "${date}"`);
  return istLocalToUtc(`${date}T00:00`);
}

/** The IST calendar date of a UTC instant, formatted for <input type="date">. */
export function utcToIstDate(date: Date): string {
  return utcToIstLocal(date).slice(0, 10);
}

/** UTC instant at which the IST calendar month containing `now` began. */
export function startOfIstMonth(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}

/** UTC instant at which the IST day containing `now` began, shifted by `days`. */
export function startOfIstDay(now: Date, days = 0): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + days) - IST_OFFSET_MS,
  );
}

/** Time left as "2d 4h", "3h 12m" or "9m 05s". Negative durations show as zero. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

const formatters = {
  dateTime: new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }),
  date: new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }),
  time: new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }),
};

export type IstFormat = keyof typeof formatters;

/** "Fri, 23 Oct, 8:00 pm" (dateTime), "23 Oct 2026" (date), "8:00 pm" (time). */
export function formatIST(date: Date, format: IstFormat = "dateTime"): string {
  // ICU versions differ on (narrow) no-break spaces before am/pm; normalise so server and
  // browser render identical text.
  return formatters[format].format(date).replace(/[  ]/g, " ");
}

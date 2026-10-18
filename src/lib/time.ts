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

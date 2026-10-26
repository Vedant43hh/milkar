// Date and date-time form fields, read back to people. Pure.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What a date or date-time field holds, as people read it: "27 Oct" or "27 Oct, 8:00 pm". Done by
 * hand from the field's text, so the server and the browser always agree.
 */
export function showFieldDate(value: string, notSet: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return notSet;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}`;
  if (!m[4]) return day;
  const hour = Number(m[4]);
  return `${day}, ${hour % 12 || 12}:${m[5]} ${hour < 12 ? "am" : "pm"}`;
}

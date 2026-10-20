// Who may trigger the scheduled jobs. Vercel Cron (and any other scheduler) sends
// "Authorization: Bearer <CRON_SECRET>".
import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** How often the server runs the jobs itself (CRON_TICK_SECONDS); 0 turns it off. */
export function tickIntervalMs(seconds: number): number | null {
  return seconds > 0 ? Math.max(seconds, 10) * 1000 : null;
}

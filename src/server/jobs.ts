import "server-only";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { CUTOFF_REMINDER_LEAD_MS, isReminderDue } from "@/lib/rounds";
import { finalizeRound, type FinalizeSummary } from "./finalize";
import { notify } from "./notifications";
import { communityResidentIds } from "./rounds";
import { expireHolds } from "./slots";

/** Finalizes every open round past its cutoff, oldest first. One failing round doesn't stop the rest. */
export async function finalizeDueRounds(now: Date): Promise<FinalizeSummary[]> {
  const due = await prisma.orderRound.findMany({
    where: { status: "OPEN", cutoffAt: { lte: now } },
    orderBy: [{ cutoffAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const done: FinalizeSummary[] = [];
  for (const { id } of due) {
    try {
      const outcome = await finalizeRound(id, now);
      if (outcome.status === "FINALIZED") done.push(outcome);
    } catch (error) {
      // Left open: the next run tries again.
      console.error(`[milkar] finalizing round ${id} failed:`, error);
    }
  }
  return done;
}

/** "Closes soon" for rounds entering their last 6 hours, once per resident per round. */
export async function sendCutoffReminders(now: Date): Promise<number> {
  const rounds = await prisma.orderRound.findMany({
    where: { status: "OPEN", cutoffAt: { gt: now, lte: new Date(now.getTime() + CUTOFF_REMINDER_LEAD_MS) } },
    select: { id: true, title: true, status: true, cutoffAt: true, createdAt: true, communityId: true },
  });
  let sent = 0;
  for (const round of rounds.filter((r) => isReminderDue(r, now))) {
    const created = await notify(
      prisma,
      await communityResidentIds(prisma, round.communityId),
      { type: "CUTOFF_REMINDER", params: { round: round.title, cutoffAt: round.cutoffAt.toISOString() }, href: `/round/${round.id}` },
      { dedupeKey: notificationKeys.cutoffReminder(round.id), now },
    );
    sent += created.length;
  }
  return sent;
}

export type JobsReport = { finalized: FinalizeSummary[]; reminders: number; expiredHolds: number };

/**
 * Everything that runs on a clock: the cutoff job, "closes soon" reminders and weekly holds that
 * ran out. Each step is idempotent and takes the same locks as checkout, so overlapping runs (two
 * servers, a retried cron call) are safe.
 */
export async function runScheduledJobs(now: Date): Promise<JobsReport> {
  const finalized = await finalizeDueRounds(now);
  const reminders = await sendCutoffReminders(now);
  const expiredHolds = await expireHolds(now);
  return { finalized, reminders, expiredHolds };
}

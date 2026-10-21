// Interest polls: "Would your flat join this?" Votes count once per flat. Pure.
import { startOfIstDay } from "./time";

const HOUR = 3_600_000;

/** True only for the vote that takes the count from below the threshold to at or above it. */
export function crossesThreshold(previousVotes: number, votes: number, threshold: number): boolean {
  return previousVotes < threshold && votes >= threshold;
}

/**
 * Whether the manager should be told now. Idempotent: once thresholdNotifiedAt is set it stays
 * false, so a retried or concurrent vote never sends a second prompt.
 */
export function shouldNotifyThreshold(poll: { threshold: number; thresholdNotifiedAt: Date | null }, votes: number): boolean {
  return poll.thresholdNotifiedAt === null && votes >= poll.threshold;
}

export function pollProgress(votes: number, threshold: number): { pct: number; remaining: number; reached: boolean } {
  return {
    pct: Math.min(100, Math.floor((Math.max(votes, 0) * 100) / threshold)),
    remaining: Math.max(threshold - votes, 0),
    reached: votes >= threshold,
  };
}

/** Pre-filled dates for a round opened from a poll: cutoff in 3 days at 8 PM IST, service in 5 days at 9 AM IST. */
export function defaultRoundDates(now: Date): { cutoffAt: Date; deliveryAt: Date } {
  return {
    cutoffAt: new Date(startOfIstDay(now, 3).getTime() + 20 * HOUR),
    deliveryAt: new Date(startOfIstDay(now, 5).getTime() + 9 * HOUR),
  };
}

export type PollStatus = "SUGGESTED" | "OPEN" | "CONVERTED" | "CLOSED";

export function canVote(poll: { status: PollStatus; closesAt: Date | null }, now: Date): boolean {
  return poll.status === "OPEN" && (poll.closesAt === null || now.getTime() < poll.closesAt.getTime());
}

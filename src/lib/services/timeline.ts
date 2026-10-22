// A visit's progress as a resident sees it: booked, on the way, started, then done (or couldn't
// get in, or cancelled). Pure: each step says whether it happened and when.
import type { VisitStatus } from "./visit";

export type TimelineStepKey = "SCHEDULED" | "ON_THE_WAY" | "IN_PROGRESS" | "COMPLETED" | "NO_ACCESS" | "CANCELLED";
export type TimelineStep = {
  key: TimelineStepKey;
  /** When it happened; null for steps still ahead. */
  at: Date | null;
  state: "done" | "current" | "upcoming";
  /** The visit ended this way without the job being done. */
  problem: boolean;
};

export type TimelineVisit = {
  status: VisitStatus;
  /** When the visit was scheduled. */
  createdAt: Date;
  onTheWayAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  noAccessAt: Date | null;
  cancelledAt: Date | null;
};

type Progress = "SCHEDULED" | "ON_THE_WAY" | "IN_PROGRESS" | "COMPLETED";
const ORDER: readonly Progress[] = ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS", "COMPLETED"];

export function visitTimeline(visit: TimelineVisit): TimelineStep[] {
  const reached: Record<Progress, Date | null> = {
    SCHEDULED: visit.createdAt,
    ON_THE_WAY: visit.onTheWayAt,
    IN_PROGRESS: visit.startedAt,
    COMPLETED: visit.completedAt,
  };

  if (visit.status === "NO_ACCESS" || visit.status === "CANCELLED") {
    // The steps that happened, then how it ended.
    const happened = ORDER.filter((key) => key !== "COMPLETED" && reached[key] !== null).map((key): TimelineStep => ({ key, at: reached[key], state: "done", problem: false }));
    const endedAt = visit.status === "NO_ACCESS" ? visit.noAccessAt : visit.cancelledAt;
    return [...happened, { key: visit.status, at: endedAt, state: "done", problem: true }];
  }

  const currentIndex = ORDER.indexOf(visit.status);
  return ORDER.map((key, i): TimelineStep => {
    const state = i < currentIndex || (i === currentIndex && key === "COMPLETED") ? "done" : i === currentIndex ? "current" : "upcoming";
    return { key, at: state === "upcoming" ? null : reached[key], state, problem: false };
  });
}

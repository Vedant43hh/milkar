// A vendor's visits, laid out the way a team plans its day. Pure.
//
// Date → time slot → tower → flat, each in natural order ("A-2" before "A-10"), so a printout or a
// phone screen reads like a route through the building.

import { natural } from "../pricing/consolidate";

const IST_OFFSET_MS = 330 * 60 * 1000;

export type ScheduleVisit = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  tower: string;
  flatNumber: string;
  community: string;
};

export type ScheduleDay<V extends ScheduleVisit> = {
  /** "2026-10-27", the IST calendar day. */
  date: string;
  slots: { startsAt: Date; endsAt: Date; towers: { community: string; tower: string; visits: V[] }[] }[];
};

function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function groupSchedule<V extends ScheduleVisit>(visits: readonly V[]): ScheduleDay<V>[] {
  const days = new Map<string, Map<number, V[]>>();
  for (const v of visits) {
    const date = istDate(v.startsAt);
    const slots = days.get(date) ?? new Map<number, V[]>();
    days.set(date, slots);
    const inSlot = slots.get(v.startsAt.getTime()) ?? [];
    slots.set(v.startsAt.getTime(), inSlot);
    inSlot.push(v);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({
      date,
      slots: [...slots.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, inSlot]) => {
          const towers = new Map<string, { community: string; tower: string; visits: V[] }>();
          for (const v of inSlot) {
            const key = `${v.community}\u0000${v.tower}`;
            const group = towers.get(key) ?? { community: v.community, tower: v.tower, visits: [] };
            towers.set(key, group);
            group.visits.push(v);
          }
          const sorted = [...towers.values()].sort((a, b) => natural.compare(a.community, b.community) || natural.compare(a.tower, b.tower));
          for (const t of sorted) t.visits.sort((a, b) => natural.compare(a.flatNumber, b.flatNumber));
          return { startsAt: inSlot[0].startsAt, endsAt: inSlot.reduce((end, v) => (v.endsAt > end ? v.endsAt : end), inSlot[0].endsAt), towers: sorted };
        }),
    }));
}

/** Two visits overlap when one starts before the other ends. */
export function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export type ReassignProblem = "SAME_TECHNICIAN" | "NOT_SCHEDULED" | "BUSY";

/**
 * Whether a visit can move to another technician: only before anyone sets out, and only to someone
 * free at that time (their other visits that aren't finished don't overlap it).
 */
export function checkReassign(
  visit: { status: string; startsAt: Date; endsAt: Date; technicianId: string | null },
  to: { technicianId: string; otherVisits: readonly { status: string; startsAt: Date; endsAt: Date }[] },
): ReassignProblem | null {
  if (visit.status !== "SCHEDULED") return "NOT_SCHEDULED";
  if (visit.technicianId === to.technicianId) return "SAME_TECHNICIAN";
  const active = ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS"];
  if (to.otherVisits.some((o) => active.includes(o.status) && overlaps(o, visit))) return "BUSY";
  return null;
}

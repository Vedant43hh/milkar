// Service Day slots: generating them from a vendor's templates, capacity, and weekly holds. Pure.
import { startOfIstDay } from "../time";

export const HOLD_TTL_MS = 24 * 60 * 60 * 1000;
const MINUTE = 60_000;
const WEEK = 7 * 24 * 60 * MINUTE;

export type SlotTemplate = { startTime: string; endTime: string; technicians: number };
export type SlotDraft = { startsAt: Date; endsAt: Date; capacity: number };

function minutesOf(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Invalid time "${time}", expected HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** One slot per template per service day. `days` are any instants inside the IST days wanted. */
export function generateSlots(templates: readonly SlotTemplate[], days: readonly Date[]): SlotDraft[] {
  const slots: SlotDraft[] = [];
  for (const day of days) {
    const midnight = startOfIstDay(day).getTime();
    for (const t of templates) {
      const start = minutesOf(t.startTime);
      const end = minutesOf(t.endTime);
      if (end <= start) throw new Error(`Slot ${t.startTime}–${t.endTime} ends before it starts`);
      if (!Number.isSafeInteger(t.technicians) || t.technicians < 1) throw new Error("A slot needs at least one technician");
      slots.push({ startsAt: new Date(midnight + start * MINUTE), endsAt: new Date(midnight + end * MINUTE), capacity: t.technicians });
    }
  }
  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export type SlotLoad = { capacity: number; bookedCount: number };

export function seatsLeft(slot: SlotLoad): number {
  return Math.max(slot.capacity - slot.bookedCount, 0);
}

export function isFull(slot: SlotLoad): boolean {
  return seatsLeft(slot) === 0;
}

export type SeatDecision = "TAKE" | "KEEP" | "FULL";

/**
 * Whether a flat can move into `to`. Staying in the slot it already holds needs no seat; otherwise
 * a seat must be free. The database enforces the same rule with a conditional increment.
 */
export function seatDecision(currentSlotId: string | null, to: SlotLoad & { id: string }): SeatDecision {
  if (currentSlotId === to.id) return "KEEP";
  return isFull(to) ? "FULL" : "TAKE";
}

/** A HELD booking keeps last week's slot for 24 hours after the new round opens. */
export function holdExpiresAt(openedAt: Date): Date {
  return new Date(openedAt.getTime() + HOLD_TTL_MS);
}

export function isHoldExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/** The same moment one week later: next week's cutoff, delivery day and slot times. */
export function oneWeekLater(date: Date): Date {
  return new Date(date.getTime() + WEEK);
}

// A service's daily time slots, as a vendor edits them. Pure.
//
// Each slot is an IST wall-clock window ("09:00"–"11:00") with how many technicians work it: that
// many flats can book it. Slots of one service don't overlap, so one team isn't in two places.

export const MAX_SLOTS = 8;
export const MAX_TECHNICIANS_PER_SLOT = 50;

export type SlotInput = { startTime: string; endTime: string; technicians: number };
export type SlotProblem = "BAD_TIME" | "END_BEFORE_START" | "TOO_SHORT" | "BAD_TECHNICIANS" | "OVERLAP" | "TOO_MANY";

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesOf(time: string): number | null {
  const m = HHMM.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Checks one slot against the service's other slots (pass the others, without this one). */
export function checkSlot(slot: SlotInput, others: readonly SlotInput[]): SlotProblem | null {
  const start = minutesOf(slot.startTime);
  const end = minutesOf(slot.endTime);
  if (start === null || end === null) return "BAD_TIME";
  if (end <= start) return "END_BEFORE_START";
  if (end - start < 30) return "TOO_SHORT";
  if (!Number.isInteger(slot.technicians) || slot.technicians < 1 || slot.technicians > MAX_TECHNICIANS_PER_SLOT) return "BAD_TECHNICIANS";
  if (others.length >= MAX_SLOTS) return "TOO_MANY";
  for (const o of others) {
    const os = minutesOf(o.startTime);
    const oe = minutesOf(o.endTime);
    if (os !== null && oe !== null && start < oe && os < end) return "OVERLAP";
  }
  return null;
}

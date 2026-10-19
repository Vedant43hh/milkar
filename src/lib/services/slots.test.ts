import { describe, expect, it } from "vitest";
import { generateSlots, holdExpiresAt, isFull, isHoldExpired, oneWeekLater, seatDecision, seatsLeft } from "./slots";

describe("generateSlots", () => {
  const templates = [
    { startTime: "14:00", endTime: "16:00", technicians: 2 },
    { startTime: "09:00", endTime: "11:00", technicians: 3 },
  ];

  it("creates one slot per template per day, in IST, with capacity = technicians", () => {
    const saturday = new Date("2026-10-24T12:00:00Z");
    const sunday = new Date("2026-10-25T12:00:00Z");
    const slots = generateSlots(templates, [sunday, saturday]);
    expect(slots.map((s) => [s.startsAt.toISOString(), s.endsAt.toISOString(), s.capacity])).toEqual([
      ["2026-10-24T03:30:00.000Z", "2026-10-24T05:30:00.000Z", 3], // Sat 9–11 AM IST
      ["2026-10-24T08:30:00.000Z", "2026-10-24T10:30:00.000Z", 2], // Sat 2–4 PM IST
      ["2026-10-25T03:30:00.000Z", "2026-10-25T05:30:00.000Z", 3],
      ["2026-10-25T08:30:00.000Z", "2026-10-25T10:30:00.000Z", 2],
    ]);
  });

  it("rejects bad templates", () => {
    const day = [new Date("2026-10-24T12:00:00Z")];
    expect(() => generateSlots([{ startTime: "9:00", endTime: "11:00", technicians: 1 }], day)).toThrow(/HH:MM/);
    expect(() => generateSlots([{ startTime: "11:00", endTime: "09:00", technicians: 1 }], day)).toThrow(/ends before/);
    expect(() => generateSlots([{ startTime: "09:00", endTime: "11:00", technicians: 0 }], day)).toThrow(/technician/);
  });
});

describe("slot capacity", () => {
  const slot = (bookedCount: number) => ({ id: "s1", capacity: 3, bookedCount });

  it("counts seats left and full slots", () => {
    expect(seatsLeft(slot(1))).toBe(2);
    expect(isFull(slot(2))).toBe(false);
    expect(isFull(slot(3))).toBe(true);
    expect(seatsLeft({ capacity: 3, bookedCount: 4 })).toBe(0);
  });

  it("takes a free seat, refuses a full slot, and lets a flat keep the seat it holds", () => {
    expect(seatDecision(null, slot(2))).toBe("TAKE");
    expect(seatDecision(null, slot(3))).toBe("FULL");
    expect(seatDecision("other", slot(3))).toBe("FULL");
    expect(seatDecision("s1", slot(3))).toBe("KEEP");
  });
});

describe("weekly holds", () => {
  const opened = new Date("2026-10-24T14:31:00Z");

  it("expire 24 hours after the new round opens", () => {
    const expires = holdExpiresAt(opened);
    expect(expires).toEqual(new Date("2026-10-25T14:31:00Z"));
    expect(isHoldExpired(expires, new Date(expires.getTime() - 1))).toBe(false);
    expect(isHoldExpired(expires, expires)).toBe(true);
  });

  it("move times forward exactly one week", () => {
    expect(oneWeekLater(opened)).toEqual(new Date("2026-10-31T14:31:00Z"));
  });
});

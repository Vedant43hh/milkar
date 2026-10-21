import { describe, expect, it } from "vitest";
import { AC, P400, P549, RICE } from "./pricing/test-fixtures";
import {
  displayStatus,
  isDueForFinalize,
  isReminderDue,
  isTakingOrders,
  roundStats,
  unitWordsFor,
  validateExtension,
  validateGroceryTimes,
  validateServiceTimes,
  type StatOffering,
} from "./rounds";

const now = new Date("2026-10-20T06:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe("opening a grocery round", () => {
  it("needs the cutoff at least an hour away and delivery after it", () => {
    expect(validateGroceryTimes({ cutoffAt: hours(1), deliveryAt: hours(30), now })).toEqual([]);
    expect(validateGroceryTimes({ cutoffAt: hours(0.5), deliveryAt: hours(30), now })).toEqual(["CUTOFF_TOO_SOON"]);
    expect(validateGroceryTimes({ cutoffAt: hours(48), deliveryAt: hours(48), now })).toEqual(["DELIVERY_BEFORE_CUTOFF"]);
  });
});

describe("opening a Service Day", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 9, 20 + d) - 330 * 60_000);

  it("accepts up to three distinct days that start after bookings close", () => {
    expect(validateServiceTimes({ cutoffAt: hours(24), days: [day(3), day(4)], firstSlotAt: hours(70), now })).toEqual([]);
  });

  it("rejects a first slot at or before the cutoff, no days, too many or repeated days", () => {
    expect(validateServiceTimes({ cutoffAt: hours(24), days: [day(1)], firstSlotAt: hours(24), now })).toEqual(["SERVICE_BEFORE_CUTOFF"]);
    expect(validateServiceTimes({ cutoffAt: hours(24), days: [], firstSlotAt: null, now })).toEqual(["NO_SERVICE_DAYS"]);
    expect(validateServiceTimes({ cutoffAt: hours(24), days: [day(3), day(4), day(5), day(6)], firstSlotAt: hours(70), now })).toEqual(["TOO_MANY_SERVICE_DAYS"]);
    expect(validateServiceTimes({ cutoffAt: hours(24), days: [day(3), day(3)], firstSlotAt: hours(70), now })).toEqual(["DUPLICATE_SERVICE_DAY"]);
  });
});

describe("extending a round", () => {
  const open = { status: "OPEN", cutoffAt: hours(10) };

  it("moves the cutoff later, but not past delivery or the first slot", () => {
    expect(validateExtension({ round: open, newCutoffAt: hours(20), now, mustCloseBefore: hours(40) })).toBeNull();
    expect(validateExtension({ round: open, newCutoffAt: hours(10), now, mustCloseBefore: hours(40) })).toBe("NOT_LATER");
    expect(validateExtension({ round: open, newCutoffAt: hours(40), now, mustCloseBefore: hours(40) })).toBe("TOO_LATE");
  });

  it("is refused once orders have closed or the round moved on", () => {
    expect(validateExtension({ round: { status: "OPEN", cutoffAt: hours(-1) }, newCutoffAt: hours(5), now, mustCloseBefore: hours(40) })).toBe("ROUND_CLOSED");
    expect(validateExtension({ round: { status: "CANCELLED", cutoffAt: hours(10) }, newCutoffAt: hours(20), now, mustCloseBefore: hours(40) })).toBe("ROUND_CLOSED");
  });

  it("knows when a round still takes orders, and shows a passed cutoff as closed", () => {
    expect(isTakingOrders(open, now)).toBe(true);
    expect(isTakingOrders({ status: "OPEN", cutoffAt: now }, now)).toBe(false);
    expect(displayStatus({ status: "OPEN", cutoffAt: hours(-1) }, now)).toBe("CLOSED");
    expect(displayStatus({ status: "FINALIZED", cutoffAt: hours(-1) }, now)).toBe("FINALIZED");
  });

  it("shows a finalized round where nothing reached its minimum as not going ahead", () => {
    const finalized = { status: "FINALIZED", cutoffAt: hours(-1) };
    expect(displayStatus({ ...finalized, offerings: [{ status: "DROPPED" }, { status: "DROPPED" }] }, now)).toBe("DROPPED");
    expect(displayStatus({ ...finalized, offerings: [{ status: "DROPPED" }, { status: "CONFIRMED" }] }, now)).toBe("FINALIZED");
    expect(displayStatus({ ...finalized, offerings: [] }, now)).toBe("FINALIZED");
    expect(displayStatus({ status: "CANCELLED", cutoffAt: hours(-1), offerings: [{ status: "DROPPED" }] }, now)).toBe("CANCELLED");
  });
});

describe("the cutoff job", () => {
  it("finalizes open rounds once their cutoff has passed, and nothing else", () => {
    expect(isDueForFinalize({ status: "OPEN", cutoffAt: now }, now)).toBe(true);
    expect(isDueForFinalize({ status: "OPEN", cutoffAt: hours(-30) }, now)).toBe(true);
    expect(isDueForFinalize({ status: "OPEN", cutoffAt: hours(0.01) }, now)).toBe(false);
    expect(isDueForFinalize({ status: "FINALIZED", cutoffAt: hours(-1) }, now)).toBe(false);
    expect(isDueForFinalize({ status: "CANCELLED", cutoffAt: hours(-1) }, now)).toBe(false);
  });

  it("reminds residents in the last 6 hours, unless the round opened inside them", () => {
    const opened = hours(-48);
    expect(isReminderDue({ status: "OPEN", cutoffAt: hours(6), createdAt: opened }, now)).toBe(true); // exactly 6 h out
    expect(isReminderDue({ status: "OPEN", cutoffAt: hours(0.5), createdAt: opened }, now)).toBe(true);
    expect(isReminderDue({ status: "OPEN", cutoffAt: hours(6.01), createdAt: opened }, now)).toBe(false); // not yet
    expect(isReminderDue({ status: "OPEN", cutoffAt: now, createdAt: opened }, now)).toBe(false); // closed
    expect(isReminderDue({ status: "OPEN", cutoffAt: hours(3), createdAt: hours(-4) }, now)).toBe(true); // opened 7 h before cutoff
    expect(isReminderDue({ status: "OPEN", cutoffAt: hours(3), createdAt: hours(-2) }, now)).toBe(false); // opened 5 h before cutoff
    expect(isReminderDue({ status: "CANCELLED", cutoffAt: hours(3), createdAt: opened }, now)).toBe(false);
  });
});

describe("roundStats (the manager's dashboard)", () => {
  const rice: StatOffering = {
    id: "rice",
    tierGroupKey: "product:rice",
    pricing: RICE,
    items: [
      { flatId: "A-101", quantity: 3, chargedPaise: 150000 },
      { flatId: "A-102", quantity: 14, chargedPaise: 700000 },
    ],
  };
  const atta: StatOffering = { id: "atta", tierGroupKey: "product:atta", pricing: { ...RICE, minOrderQty: 8 }, items: [{ flatId: "A-101", quantity: 2, chargedPaise: 100000 }] };
  const split: StatOffering = {
    id: "split",
    tierGroupKey: "service:ac",
    pricing: AC,
    items: Array.from({ length: 14 }, (_, i) => ({ flatId: `F${i}`, quantity: 1, chargedPaise: P549 })),
  };
  const windowAc: StatOffering = { id: "window", tierGroupKey: "service:ac", pricing: AC, items: [{ flatId: "F0", quantity: 1, chargedPaise: P549 }] };

  it("totals flats, units and money, counting each flat once", () => {
    const stats = roundStats([rice, atta]);
    expect(stats).toMatchObject({ flats: 2, units: 19, collectedPaise: 950000 });
  });

  it("puts the item nearest its next tier first, and lists items below the vendor minimum", () => {
    const stats = roundStats([rice, atta]);
    expect(stats.closeToUnlock.map((s) => [s.id, s.meter.next?.needed])).toEqual([["rice", 3]]);
    expect(stats.belowMinimum.map((s) => [s.id, s.meter.toQualify])).toEqual([["atta", 6]]);
  });

  it("measures every option of a Service Day on the same flat count", () => {
    const stats = roundStats([split, windowAc]);
    expect(stats.offerings.map((s) => s.meter.count)).toEqual([14, 14]);
    expect(stats.offerings[1]).toMatchObject({ units: 1, flats: 1 });
    expect(stats.closeToUnlock[0].meter.next).toMatchObject({ needed: 6, unitPaise: P400 });
    expect(stats.flats).toBe(14);
  });
});

describe("unitWordsFor", () => {
  it("pluralises a community's unit label", () => {
    expect(unitWordsFor("Flat")).toEqual({ one: "flat", other: "flats" });
    expect(unitWordsFor("Room")).toEqual({ one: "room", other: "rooms" });
    expect(unitWordsFor("Villa")).toEqual({ one: "villa", other: "villas" });
    expect(unitWordsFor("Bunglow house").other).toBe("bunglow houses");
  });
});

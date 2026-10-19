import { describe, expect, it } from "vitest";
import { canAdd, canReduce, checkChange, isQuoteExpired, reductionFreezeAt, type ChangeCheck } from "./rules";

const cutoffAt = new Date("2026-10-23T14:30:00Z"); // Fri 8:00 PM IST
const round = { status: "OPEN", cutoffAt, reductionFreezeMinutes: 720 };
const freezeAt = new Date("2026-10-23T02:30:00Z"); // Fri 8:00 AM IST
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta);

const base: ChangeCheck = {
  round,
  now: ms(freezeAt, -60_000),
  offeringId: "rice",
  offeringActive: true,
  currentQty: 2,
  targetQty: 2,
  flatOthersQty: 0,
  maxQtyPerFlat: 6,
};

describe("round windows", () => {
  it("freezes reductions 12 hours before cutoff", () => {
    expect(reductionFreezeAt(round)).toEqual(freezeAt);
  });

  it("allows additions until the cutoff instant (exclusive)", () => {
    expect(canAdd(round, ms(cutoffAt, -1))).toBe(true);
    expect(canAdd(round, cutoffAt)).toBe(false);
  });

  it("allows reductions until the freeze instant (exclusive)", () => {
    expect(canReduce(round, ms(freezeAt, -1))).toBe(true);
    expect(canReduce(round, freezeAt)).toBe(false);
  });

  it("moves the freeze when the cutoff is extended", () => {
    const extended = { ...round, cutoffAt: ms(cutoffAt, 24 * 3600_000) };
    expect(canReduce(extended, ms(freezeAt, 3600_000))).toBe(true);
  });

  it("closes everything once the round is no longer OPEN", () => {
    const finalized = { ...round, status: "FINALIZED" };
    expect(canAdd(finalized, ms(freezeAt, -3600_000))).toBe(false);
    expect(canReduce(finalized, ms(freezeAt, -3600_000))).toBe(false);
  });

  it("expires quotes at exactly expiresAt", () => {
    const expiresAt = new Date("2026-10-20T10:15:00Z");
    expect(isQuoteExpired(expiresAt, ms(expiresAt, -1))).toBe(false);
    expect(isQuoteExpired(expiresAt, expiresAt)).toBe(true);
  });
});

describe("checkChange", () => {
  it("accepts a reduction at freeze − 1 ms and rejects it at the freeze", () => {
    expect(checkChange({ ...base, now: ms(freezeAt, -1), targetQty: 0 })).toBeNull();
    expect(checkChange({ ...base, now: freezeAt, targetQty: 0 })?.code).toBe("REDUCTION_FROZEN");
  });

  it("still accepts additions during the freeze", () => {
    expect(checkChange({ ...base, now: ms(cutoffAt, -1), targetQty: 3 })).toBeNull();
  });

  it("rejects additions at the cutoff", () => {
    expect(checkChange({ ...base, now: cutoffAt, targetQty: 3 })?.code).toBe("ROUND_CLOSED");
  });

  it("caps the whole flat, summed across family members", () => {
    expect(checkChange({ ...base, flatOthersQty: 3, targetQty: 3 })).toBeNull();
    expect(checkChange({ ...base, flatOthersQty: 3, targetQty: 4 })).toEqual({
      code: "FLAT_CAP_EXCEEDED",
      offeringId: "rice",
      maxAllowed: 3,
    });
  });

  it("lets a resident reduce even if the flat is over the cap", () => {
    // e.g. the captain lowered the cap after orders were placed
    expect(checkChange({ ...base, flatOthersQty: 10, currentQty: 4, targetQty: 2 })).toBeNull();
  });

  it("rejects invalid quantities and inactive products", () => {
    expect(checkChange({ ...base, targetQty: -1 })?.code).toBe("INVALID_QUANTITY");
    expect(checkChange({ ...base, targetQty: 1.5 })?.code).toBe("INVALID_QUANTITY");
    expect(checkChange({ ...base, offeringActive: false, targetQty: 3 })?.code).toBe("OFFERING_UNAVAILABLE");
  });

  it("treats an unchanged quantity as a no-op even after cutoff", () => {
    expect(checkChange({ ...base, now: ms(cutoffAt, 1) })).toBeNull();
  });
});

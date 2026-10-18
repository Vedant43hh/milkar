import { describe, expect, it } from "vitest";
import { lotsQty, lotsTotal, removeUnits } from "./lots";
import { P440, P465, P500 } from "./test-fixtures";

const lots = [
  { id: "a", quantity: 2, unitPricePaise: P500, seq: 1 },
  { id: "b", quantity: 3, unitPricePaise: P465, seq: 2 },
  { id: "c", quantity: 1, unitPricePaise: P500, seq: 3 },
];

describe("lots", () => {
  it("totals quantity and amount", () => {
    expect(lotsQty(lots)).toBe(6);
    expect(lotsTotal(lots)).toBe(3 * P500 + 3 * P465);
  });

  it("removes the most expensive units first, newest first on ties", () => {
    const { removed, remaining, refundPaise } = removeUnits(lots, 2);
    expect(removed).toEqual([
      { lot: lots[0], units: 1 },
      { lot: lots[2], units: 1 },
    ]);
    expect(refundPaise).toBe(2 * P500);
    expect(remaining).toEqual([
      { id: "a", quantity: 1, unitPricePaise: P500, seq: 1 },
      { id: "b", quantity: 3, unitPricePaise: P465, seq: 2 },
    ]);
  });

  it("refunds exactly what was paid when cancelling everything", () => {
    const { remaining, refundPaise } = removeUnits(lots, 6);
    expect(remaining).toEqual([]);
    expect(refundPaise).toBe(lotsTotal(lots));
  });

  it("moves into cheaper lots once expensive ones are used up", () => {
    const mixed = [
      { id: "x", quantity: 1, unitPricePaise: P440, seq: 1 },
      { id: "y", quantity: 1, unitPricePaise: P465, seq: 2 },
    ];
    expect(removeUnits(mixed, 2).refundPaise).toBe(P440 + P465);
    expect(removeUnits(mixed, 1).refundPaise).toBe(P465);
  });

  it("rejects removing more than was bought", () => {
    expect(() => removeUnits(lots, 7)).toThrow(RangeError);
    expect(() => removeUnits(lots, -1)).toThrow(RangeError);
    expect(removeUnits(lots, 0).refundPaise).toBe(0);
  });
});

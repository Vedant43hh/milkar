import { describe, expect, it } from "vitest";
import { RICE_TIERS } from "./test-fixtures";
import { nextTierAfter, tierAt, tierIndexAt, validateTiers } from "./tiers";

describe("tierAt", () => {
  it.each([
    [0, 1],
    [1, 1],
    [19, 1],
    [20, 20], // exactly on the boundary unlocks the tier
    [49, 20],
    [50, 50],
    [10_000, 50],
  ])("quantity %i uses the tier starting at %i", (qty, minQty) => {
    expect(tierAt(RICE_TIERS, qty).minQty).toBe(minQty);
  });

  it("does not depend on input order", () => {
    const shuffled = [RICE_TIERS[2], RICE_TIERS[0], RICE_TIERS[1]];
    expect(tierIndexAt(shuffled, 35)).toBe(1);
    expect(tierAt(shuffled, 35).supplierPricePaise).toBe(42996);
  });

  it("rejects tiers that do not start at 1", () => {
    expect(() => tierAt([{ minQty: 5, supplierPricePaise: 100 }], 3)).toThrow();
  });
});

describe("nextTierAfter", () => {
  it("reports units needed for the next tier", () => {
    expect(nextTierAfter(RICE_TIERS, 0)).toEqual({ tier: RICE_TIERS[1], unitsNeeded: 20 });
    expect(nextTierAfter(RICE_TIERS, 12)?.unitsNeeded).toBe(8);
    expect(nextTierAfter(RICE_TIERS, 19)?.unitsNeeded).toBe(1);
    expect(nextTierAfter(RICE_TIERS, 20)).toEqual({ tier: RICE_TIERS[2], unitsNeeded: 30 });
    expect(nextTierAfter(RICE_TIERS, 49)?.unitsNeeded).toBe(1);
  });

  it("returns null at the best tier", () => {
    expect(nextTierAfter(RICE_TIERS, 50)).toBeNull();
    expect(nextTierAfter(RICE_TIERS, 500)).toBeNull();
  });
});

describe("validateTiers", () => {
  it("accepts valid tiers", () => {
    expect(validateTiers(RICE_TIERS)).toEqual([]);
    expect(validateTiers([{ minQty: 1, supplierPricePaise: 100 }])).toEqual([]);
  });

  it("requires at least one tier starting at 1", () => {
    expect(validateTiers([])).toHaveLength(1);
    expect(validateTiers([{ minQty: 2, supplierPricePaise: 100 }])).toContain(
      "The first tier must start at quantity 1.",
    );
  });

  it("rejects duplicate starts and prices that do not drop", () => {
    expect(
      validateTiers([
        { minQty: 1, supplierPricePaise: 100 },
        { minQty: 1, supplierPricePaise: 90 },
      ]),
    ).toContain("Two tiers start at quantity 1.");
    expect(
      validateTiers([
        { minQty: 1, supplierPricePaise: 100 },
        { minQty: 10, supplierPricePaise: 100 },
      ]),
    ).toContain("Tier starting at 10 must be cheaper than the tier before it.");
  });

  it("rejects non-integer quantities and prices", () => {
    expect(validateTiers([{ minQty: 1, supplierPricePaise: 99.5 }]).length).toBeGreaterThan(0);
    expect(
      validateTiers([
        { minQty: 1, supplierPricePaise: 100 },
        { minQty: 2.5, supplierPricePaise: 90 },
      ]).length,
    ).toBeGreaterThan(0);
  });
});

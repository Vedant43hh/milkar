import { describe, expect, it } from "vitest";
import { applyQuoteLine, lotsKey, quoteChanges, type IdLot, type QuoteInput, type QuoteOffering } from "./checkout";
import { P465, P500, RICE } from "./test-fixtures";

const cutoffAt = new Date("2026-10-23T14:30:00Z");
const round = { status: "OPEN", cutoffAt, reductionFreezeMinutes: 720 };
const beforeFreeze = new Date("2026-10-22T10:00:00Z");

function rice(overrides: Partial<QuoteOffering> = {}): QuoteOffering {
  return {
    offeringId: "rice",
    pricing: RICE,
    active: true,
    maxQtyPerFlat: 20,
    basisCount: 0,
    flatOthersQty: 0,
    userLots: [],
    ...overrides,
  };
}

function quote(overrides: Partial<QuoteInput>) {
  return quoteChanges({
    round,
    now: beforeFreeze,
    offerings: [rice()],
    targets: {},
    walletBalancePaise: 0,
    ...overrides,
  });
}

describe("quoteChanges: which tier price is charged", () => {
  it("charges added units at the tier BEFORE the change, even if the order crosses a boundary", () => {
    // Community at 45 bags (₹465 tier). Adding 10 takes it to 55 (₹440 tier),
    // but the new bags are charged at ₹465; the ₹25/bag comes back at cutoff if 50+ holds.
    const result = quote({ offerings: [rice({ basisCount: 45 })], targets: { rice: 10 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.lines[0]).toMatchObject({ addQty: 10, addUnitPaise: P465, addPaise: 10 * P465 });
    expect(result.quote.gatewayPaise).toBe(10 * P465);
  });

  it("charges the 1–19 price when an order lands exactly on the 20-bag boundary", () => {
    const result = quote({ offerings: [rice({ basisCount: 19 })], targets: { rice: 1 } });
    expect(result.ok && result.quote.lines[0].addUnitPaise).toBe(P500);
  });

  it("counts the resident's own existing units in the community total", () => {
    const userLots: IdLot[] = [{ id: "l1", quantity: 5, unitPricePaise: P500, seq: 1 }];
    const result = quote({ offerings: [rice({ basisCount: 20, userLots })], targets: { rice: 6 } });
    expect(result.ok && result.quote.lines[0]).toMatchObject({ baseQty: 5, addQty: 1, addUnitPaise: P465 });
  });
});

describe("quoteChanges: reductions, wallet and errors", () => {
  const userLots: IdLot[] = [
    { id: "cheap", quantity: 2, unitPricePaise: P465, seq: 2 },
    { id: "dear", quantity: 2, unitPricePaise: P500, seq: 1 },
  ];

  it("refunds removed units at what was paid, most expensive first", () => {
    const result = quote({ offerings: [rice({ basisCount: 30, userLots })], targets: { rice: 1 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.lines[0].removals).toEqual([
      { lotId: "cheap", units: 1, unitPricePaise: P465 },
      { lotId: "dear", units: 2, unitPricePaise: P500 },
    ]);
    expect(result.quote).toMatchObject({ chargePaise: 0, creditPaise: 2 * P500 + P465, gatewayPaise: 0 });
  });

  it("applies wallet balance before the gateway", () => {
    const result = quote({ targets: { rice: 2 }, walletBalancePaise: 30000 });
    expect(result.ok && result.quote).toMatchObject({
      chargePaise: 2 * P500,
      walletAppliedPaise: 30000,
      gatewayPaise: 2 * P500 - 30000,
    });
  });

  it("lets credit from a reduction pay for an addition in the same change", () => {
    const atta = rice({ offeringId: "atta", basisCount: 0 });
    const result = quote({
      offerings: [rice({ basisCount: 30, userLots }), atta],
      targets: { rice: 2, atta: 1 }, // drop the two ₹500 bags, add one atta at ₹500
    });
    expect(result.ok && result.quote).toMatchObject({
      chargePaise: P500,
      creditPaise: 2 * P500,
      walletAppliedPaise: P500,
      gatewayPaise: 0,
    });
  });

  it("collects every error instead of stopping at the first", () => {
    const frozenNow = new Date("2026-10-23T10:00:00Z"); // inside the 12h freeze
    const result = quote({
      now: frozenNow,
      offerings: [rice({ userLots }), rice({ offeringId: "atta", maxQtyPerFlat: 2, flatOthersQty: 1 })],
      targets: { rice: 0, atta: 3, ghost: 1 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code).sort()).toEqual([
      "FLAT_CAP_EXCEEDED",
      "OFFERING_UNAVAILABLE",
      "REDUCTION_FROZEN",
    ]);
  });

  it("skips offerings whose quantity does not change", () => {
    const result = quote({ offerings: [rice({ userLots })], targets: { rice: 4 } });
    expect(result.ok && result.quote.lines).toEqual([]);
  });
});

describe("applyQuoteLine / lotsKey", () => {
  it("adds a new lot or removes units", () => {
    const lots: IdLot[] = [{ id: "a", quantity: 3, unitPricePaise: P500, seq: 1 }];
    const added = quote({ offerings: [rice({ basisCount: 25, userLots: lots })], targets: { rice: 5 } });
    if (!added.ok) throw new Error("expected ok");
    const next = applyQuoteLine(lots, added.quote.lines[0], (quantity, unitPricePaise) => ({
      id: "new",
      quantity,
      unitPricePaise,
      seq: 2,
    }));
    expect(next).toEqual([...lots, { id: "new", quantity: 2, unitPricePaise: P465, seq: 2 }]);

    const removed = quote({ offerings: [rice({ userLots: next })], targets: { rice: 1 } });
    if (!removed.ok) throw new Error("expected ok");
    const after = applyQuoteLine(next, removed.quote.lines[0], () => {
      throw new Error("no lot should be created");
    });
    expect(after).toEqual([{ id: "new", quantity: 1, unitPricePaise: P465, seq: 2 }]);
  });

  it("fingerprints lots independent of order", () => {
    const a: IdLot = { id: "a", quantity: 1, unitPricePaise: 1, seq: 1 };
    const b: IdLot = { id: "b", quantity: 2, unitPricePaise: 1, seq: 2 };
    expect(lotsKey([a, b])).toBe(lotsKey([b, a]));
    expect(lotsKey([a, b])).not.toBe(lotsKey([a, { ...b, quantity: 3 }]));
  });
});

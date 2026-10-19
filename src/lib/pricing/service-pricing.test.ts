// Service Days use the same engine as groceries, with tiers reached on distinct flats booked
// across every option of the service.
import { describe, expect, it } from "vitest";
import { groupBasis } from "./basis";
import { applyQuoteLine, quoteChanges, type IdLot, type QuoteOffering } from "./checkout";
import { computeFinalization, type FinalizeItem, type FinalizeOffering } from "./finalize";
import { lotsQty, lotsTotal, type Lot } from "./lots";
import { computeMeter } from "./meter";
import { AC, AC_TIERS, MARGIN_BPS, P400, P549, P699 } from "./test-fixtures";

const GROUP = "service:ac";

let seq = 0;
function item(id: string, flatId: string, lots: [qty: number, price: number][]): FinalizeItem {
  const built: Lot[] = lots.map(([quantity, unitPricePaise]) => ({ quantity, unitPricePaise, seq: ++seq }));
  return { orderItemId: id, userId: `u-${id}`, flatId, lots: built, chargedPaise: lotsTotal(built) };
}

function option(offeringId: string, items: FinalizeItem[], overrides: Partial<FinalizeOffering> = {}): FinalizeOffering {
  return {
    offeringId,
    tierGroupKey: GROUP,
    tierBasis: "FLATS",
    tiers: AC_TIERS,
    gstBps: AC.gstBps,
    minOrderQty: AC.minOrderQty,
    items,
    ...overrides,
  };
}

const finalize = (...offerings: FinalizeOffering[]) => computeFinalization({ marginBps: MARGIN_BPS, offerings });

describe("finalizing a Service Day on the flats basis", () => {
  it("counts distinct flats across every option of the service", () => {
    // Split AC in 3 flats, Window AC in 3 flats, one flat books both: 5 distinct flats → ₹549.
    const result = finalize(
      option("split", [item("s1", "f1", [[2, P699]]), item("s2", "f2", [[1, P699]]), item("s3", "f3", [[1, P699]])]),
      option("window", [item("w3", "f3", [[1, P699]]), item("w4", "f4", [[1, P699]]), item("w5", "f5", [[1, P549]])]),
    );
    expect(result.groups).toEqual([
      { tierGroupKey: GROUP, tierBasis: "FLATS", basisCount: 5, status: "CONFIRMED", dropReason: null },
    ]);
    const [split, window] = result.offerings;
    expect(split).toMatchObject({ status: "CONFIRMED", totalQty: 4, basisCount: 5 });
    expect(split.unit?.totalPaise).toBe(P549);
    expect(window.unit?.totalPaise).toBe(P549);
    // Two ACs at ₹699 come down to ₹549: ₹300 back.
    expect(split.items[0]).toMatchObject({ quantity: 2, finalPaise: 2 * P549, refundPaise: 2 * (P699 - P549) });
    expect(window.items[2]).toMatchObject({ finalPaise: P549, refundPaise: 0 });
  });

  it("counts family members in the same flat once", () => {
    const result = finalize(
      option("split", [
        item("asha", "f1", [[1, P699]]),
        item("ravi", "f1", [[1, P699]]), // same flat as Asha
        item("b", "f2", [[1, P699]]),
        item("c", "f3", [[1, P699]]),
        item("d", "f4", [[1, P699]]),
      ]),
    );
    expect(result.groups[0]).toMatchObject({ basisCount: 4, status: "DROPPED", dropReason: "BELOW_MINIMUM" });
  });

  it("drops every option, with full refunds, when the service falls short of its minimum flats", () => {
    // Four flats book lots of units, but the vendor needs 5 flats.
    const result = finalize(
      option("split", [item("a", "f1", [[4, P699]]), item("b", "f2", [[3, P699]])]),
      option("window", [item("c", "f3", [[2, P699]]), item("d", "f4", [[1, P699]])]),
    );
    expect(result.offerings.map((o) => [o.status, o.dropReason])).toEqual([
      ["DROPPED", "BELOW_MINIMUM"],
      ["DROPPED", "BELOW_MINIMUM"],
    ]);
    expect(result.offerings.flatMap((o) => o.items.map((i) => i.refundPaise))).toEqual([4 * P699, 3 * P699, 2 * P699, P699]);
    expect(result.totals.refundsPaise).toBe(10 * P699);
  });

  it("confirms exactly at the minimum, and an option nobody booked has nothing to confirm", () => {
    const result = finalize(
      option("split", ["f1", "f2", "f3", "f4", "f5"].map((f, i) => item(`s${i}`, f, [[1, P699]]))),
      option("window", []),
    );
    expect(result.groups[0]).toMatchObject({ basisCount: 5, status: "CONFIRMED" });
    expect(result.offerings[0].status).toBe("CONFIRMED");
    expect(result.offerings[1]).toMatchObject({ status: "DROPPED", dropReason: "NO_ORDERS", items: [] });
  });

  it("keeps price protection: cancellations that lower the tier never charge more", () => {
    // Someone booked at ₹400 while 20+ flats were in; cancellations left 19 flats → ₹549.
    const flats = Array.from({ length: 18 }, (_, i) => item(`x${i}`, `f${i}`, [[1, P549]]));
    const result = finalize(option("split", [...flats, item("early", "fz", [[1, P400]])]));
    const early = result.offerings[0].items.at(-1);
    expect(result.offerings[0].unit?.totalPaise).toBe(P549);
    expect(early).toMatchObject({ finalPaise: P400, refundPaise: 0, absorbedPaise: P549 - P400 });
  });

  it("refuses a group that mixes bases or minimums", () => {
    expect(() => finalize(option("a", []), option("b", [], { tierBasis: "UNITS" }))).toThrow(/mixes/);
    expect(() => finalize(option("a", []), option("b", [], { minOrderQty: 3 }))).toThrow(/minimum/);
  });
});

describe("booking a Service Day: which tier price is charged", () => {
  const cutoffAt = new Date("2026-10-23T14:30:00Z");
  const round = { status: "OPEN", cutoffAt, reductionFreezeMinutes: 720 };
  const now = new Date("2026-10-21T10:00:00Z");

  /** One Service Day with two options; tracks every resident's lots per option. */
  function serviceDay() {
    const lots = new Map<string, { flatId: string; offeringId: string; lots: IdLot[] }>();
    let n = 0;
    const key = (user: string, offeringId: string) => `${user}:${offeringId}`;

    function book(user: string, flatId: string, targets: Record<string, number>) {
      const all = [...lots.values()];
      const basisCount = groupBasis(
        all.map((l) => ({ flatId: l.flatId, quantity: lotsQty(l.lots) })),
        "FLATS",
      );
      const offerings: QuoteOffering[] = Object.keys(targets).map((offeringId) => ({
        offeringId,
        pricing: AC,
        active: true,
        maxQtyPerFlat: 3,
        basisCount,
        flatOthersQty: [...lots.entries()]
          .filter(([k, l]) => k !== key(user, offeringId) && l.offeringId === offeringId && l.flatId === flatId)
          .reduce((s, [, l]) => s + lotsQty(l.lots), 0),
        userLots: lots.get(key(user, offeringId))?.lots ?? [],
      }));
      const result = quoteChanges({ round, now, offerings, targets, walletBalancePaise: 0 });
      if (!result.ok) return result;
      for (const line of result.quote.lines) {
        const entry = lots.get(key(user, line.offeringId)) ?? { flatId, offeringId: line.offeringId, lots: [] };
        entry.lots = applyQuoteLine(entry.lots, line, (quantity, unitPricePaise) => ({ id: `l${++n}`, quantity, unitPricePaise, seq: n }));
        lots.set(key(user, line.offeringId), entry);
      }
      return result;
    }
    const flats = () => groupBasis([...lots.values()].map((l) => ({ flatId: l.flatId, quantity: lotsQty(l.lots) })), "FLATS");
    return { book, flats, lots };
  }

  it("charges a new flat at the tier BEFORE it joins: the 5th flat pays ₹699, then gets ₹150 back", () => {
    const day = serviceDay();
    for (const f of ["f1", "f2", "f3", "f4"]) day.book(`u-${f}`, f, { split: 1 });
    expect(day.flats()).toBe(4);

    const fifth = day.book("u-f5", "f5", { split: 2 });
    expect(fifth.ok && fifth.quote.lines[0]).toMatchObject({ addQty: 2, addUnitPaise: P699 });
    expect(day.flats()).toBe(5);

    // The sixth flat sees the unlocked ₹549 price.
    const sixth = day.book("u-f6", "f6", { window: 1 });
    expect(sixth.ok && sixth.quote.lines[0].addUnitPaise).toBe(P549);

    const result = finalize(
      ...["split", "window"].map((id) =>
        option(
          id,
          [...day.lots.entries()]
            .filter(([, l]) => l.offeringId === id)
            .map(([k, l]) => ({ orderItemId: k, userId: k, flatId: l.flatId, lots: l.lots, chargedPaise: lotsTotal(l.lots) })),
        ),
      ),
    );
    expect(result.groups[0].basisCount).toBe(6);
    const fifthItem = result.offerings[0].items.find((i) => i.flatId === "f5");
    expect(fifthItem).toMatchObject({ chargedPaise: 2 * P699, finalPaise: 2 * P549, refundPaise: 2 * 15000 });
  });

  it("a family member adding units to an already-booked flat does not change the flat count", () => {
    const day = serviceDay();
    for (const f of ["f1", "f2", "f3", "f4", "f5"]) day.book(`u-${f}`, f, { split: 1 });
    day.book("spouse-f1", "f1", { window: 1 });
    expect(day.flats()).toBe(5);
  });

  it("applies the per-flat cap to each option across family members", () => {
    const day = serviceDay();
    day.book("asha", "f1", { split: 2 });
    const ravi = day.book("ravi", "f1", { split: 2 }); // flat cap is 3 split ACs
    expect(!ravi.ok && ravi.errors[0]).toEqual({ code: "FLAT_CAP_EXCEEDED", offeringId: "split", maxAllowed: 1 });
  });
});

describe("the meter on the flats basis", () => {
  it("shows flats still needed to start and to unlock the next price", () => {
    const below = computeMeter(AC, 3);
    expect(below).toMatchObject({ basis: "FLATS", count: 3, qualifies: false, toQualify: 2, currentUnitPaise: P699 });

    const open = computeMeter(AC, 14);
    expect(open).toMatchObject({ qualifies: true, currentUnitPaise: P549 });
    expect(open.next).toEqual({ minQty: 20, unitPaise: P400, needed: 6, savingPerUnitPaise: P549 - P400 });
  });
});

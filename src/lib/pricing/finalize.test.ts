import { describe, expect, it } from "vitest";
import { computeFinalization, type FinalizeItem, type FinalizeProduct } from "./finalize";
import { lotsTotal, type Lot } from "./lots";
import { MARGIN_BPS, P440, P465, P500, RICE } from "./test-fixtures";

let seq = 0;
function item(id: string, flatId: string, lots: [qty: number, price: number][]): FinalizeItem {
  const built: Lot[] = lots.map(([quantity, unitPricePaise]) => ({ quantity, unitPricePaise, seq: ++seq }));
  return { orderItemId: id, userId: `u-${id}`, flatId, lots: built, chargedPaise: lotsTotal(built) };
}

function rice(items: FinalizeItem[], overrides: Partial<FinalizeProduct> = {}): FinalizeProduct {
  return { roundProductId: "rice", tiers: RICE.tiers, gstBps: RICE.gstBps, minOrderQty: 10, items, ...overrides };
}

function finalize(...products: FinalizeProduct[]) {
  return computeFinalization({ marginBps: MARGIN_BPS, products });
}

describe("computeFinalization", () => {
  it("refunds the difference when a better tier is reached", () => {
    // 15 bags bought at ₹500, 10 more at ₹465 once the society passed 20; final total 25 → ₹465.
    const [rice25] = finalize(rice([item("a", "f1", [[15, P500]]), item("b", "f2", [[10, P465]])])).products;
    expect(rice25.status).toBe("CONFIRMED");
    expect(rice25.unit?.totalPaise).toBe(P465);
    expect(rice25.items).toEqual([
      expect.objectContaining({ orderItemId: "a", finalPaise: 15 * P465, refundPaise: 15 * 3500, absorbedPaise: 0 }),
      expect.objectContaining({ orderItemId: "b", finalPaise: 10 * P465, refundPaise: 0, absorbedPaise: 0 }),
    ]);
  });

  it("refunds nothing when the tier is unchanged", () => {
    const [p] = finalize(rice([item("a", "f1", [[12, P500]])])).products;
    expect(p.items[0]).toMatchObject({ finalPaise: 12 * P500, refundPaise: 0 });
  });

  it("reaching a boundary exactly unlocks the tier for everyone", () => {
    const [p] = finalize(rice([item("a", "f1", [[19, P500]]), item("b", "f2", [[1, P500]])])).products;
    expect(p.totalQty).toBe(20);
    expect(p.unit?.totalPaise).toBe(P465);
    expect(p.items.map((i) => i.refundPaise)).toEqual([19 * 3500, 3500]);
  });

  it("protects residents when cancellations drop the society to a worse tier", () => {
    // Ravi bought at ₹440 when the society was at 50+, cancellations left 47 → ₹465.
    const [p] = finalize(rice([item("ravi", "f1", [[2, P440]]), item("asha", "f2", [[45, P500]])])).products;
    expect(p.unit?.totalPaise).toBe(P465);
    const [ravi, asha] = p.items;
    expect(ravi).toMatchObject({ finalPaise: 2 * P440, refundPaise: 0, absorbedPaise: 2 * 2500 });
    expect(asha).toMatchObject({ finalPaise: 45 * P465, refundPaise: 45 * 3500, absorbedPaise: 0 });
  });

  it("prices each lot separately for residents who bought at several prices", () => {
    const [p] = finalize(
      rice([item("mix", "f1", [[2, P500], [3, P440]]), item("rest", "f2", [[42, P500]])]),
    ).products;
    // total 47 → ₹465: ₹500 lots come down to ₹465, ₹440 lots stay at ₹440
    expect(p.items[0]).toMatchObject({
      chargedPaise: 2 * P500 + 3 * P440,
      finalPaise: 2 * P465 + 3 * P440,
      refundPaise: 2 * 3500,
      absorbedPaise: 3 * 2500,
    });
    expect(p.items[0].refundPaise).toBeGreaterThanOrEqual(0);
  });

  it("confirms a product exactly at the supplier minimum", () => {
    const [p] = finalize(rice([item("a", "f1", [[10, P500]])])).products;
    expect(p.status).toBe("CONFIRMED");
  });

  it("drops a product one unit below the minimum and refunds everyone in full", () => {
    const [p] = finalize(rice([item("a", "f1", [[6, P500]]), item("b", "f2", [[3, P500]])])).products;
    expect(p).toMatchObject({ status: "DROPPED", dropReason: "BELOW_MINIMUM", totalQty: 9, unit: null });
    expect(p.items.map((i) => [i.finalPaise, i.refundPaise])).toEqual([
      [0, 6 * P500],
      [0, 3 * P500],
    ]);
  });

  it("drops a product nobody ordered without refunds, and ignores fully cancelled items", () => {
    const cancelled: FinalizeItem = { orderItemId: "c", userId: "u", flatId: "f", lots: [], chargedPaise: 0 };
    const [p] = finalize(rice([cancelled])).products;
    expect(p).toMatchObject({ status: "DROPPED", dropReason: "NO_ORDERS", items: [] });
  });

  it("finalizes products independently", () => {
    const result = finalize(
      rice([item("a", "f1", [[25, P500]])]),
      rice([item("b", "f1", [[2, 10000]])], {
        roundProductId: "ghee",
        tiers: [{ minQty: 1, supplierPricePaise: 9000 }],
        minOrderQty: 5,
      }),
    );
    expect(result.products.map((p) => p.status)).toEqual(["CONFIRMED", "DROPPED"]);
    expect(result.totals.refundsPaise).toBe(25 * 3500 + 2 * 10000);
  });

  it("totals what residents paid, supplier cost and gross margin", () => {
    const { totals } = finalize(rice([item("a", "f1", [[20, P500]])]));
    expect(totals).toEqual({
      residentPaidPaise: 20 * P465,
      refundsPaise: 20 * 3500,
      absorbedPaise: 0,
      supplierCostPaise: 20 * 42996,
      grossMarginPaise: 20 * 1290,
    });
  });

  it("refuses inconsistent data where the charge does not match the lots", () => {
    const bad = { ...item("a", "f1", [[12, P500]]), chargedPaise: 1 };
    expect(() => finalize(rice([bad]))).toThrow(/does not match/);
  });
});

// End-to-end scenarios composed from the pure pieces: quote → apply → finalize.
import { describe, expect, it } from "vitest";
import { applyQuoteLine, quoteChanges, type IdLot } from "./checkout";
import { computeFinalization } from "./finalize";
import { lotsQty, lotsTotal } from "./lots";
import { MARGIN_BPS, P440, P465, RICE } from "./test-fixtures";

const HOUR = 3600_000;
const cutoffAt = new Date("2026-10-23T14:30:00Z"); // Fri 8 PM IST, freeze at Fri 8 AM IST
const at = (hoursBeforeCutoff: number) => new Date(cutoffAt.getTime() - hoursBeforeCutoff * HOUR);

/** A society buying one product (rice), tracking each resident's lots and wallet. */
function society(maxQtyPerFlat = 20) {
  const round = { status: "OPEN", cutoffAt, reductionFreezeMinutes: 720 };
  const residents = new Map<string, { flatId: string; lots: IdLot[]; wallet: number }>();
  let seq = 0;

  const total = () => [...residents.values()].reduce((n, r) => n + lotsQty(r.lots), 0);

  function setQty(name: string, flatId: string, target: number, now: Date) {
    const me = residents.get(name) ?? { flatId, lots: [], wallet: 0 };
    residents.set(name, me);
    const flatOthersQty = [...residents.entries()]
      .filter(([other, r]) => other !== name && r.flatId === flatId)
      .reduce((n, [, r]) => n + lotsQty(r.lots), 0);
    const result = quoteChanges({
      round,
      now,
      targets: { rice: target },
      walletBalancePaise: me.wallet,
      products: [
        {
          roundProductId: "rice",
          pricing: RICE,
          active: true,
          maxQtyPerFlat,
          societyQty: total(),
          flatOthersQty,
          userLots: me.lots,
        },
      ],
    });
    if (!result.ok) return result;
    for (const line of result.quote.lines) {
      me.lots = applyQuoteLine(me.lots, line, (quantity, unitPricePaise) => ({
        id: `lot-${++seq}`,
        quantity,
        unitPricePaise,
        seq,
      }));
    }
    me.wallet += result.quote.creditPaise - result.quote.walletAppliedPaise;
    return result;
  }

  function finalize() {
    return computeFinalization({
      marginBps: MARGIN_BPS,
      products: [
        {
          roundProductId: "rice",
          tiers: RICE.tiers,
          gstBps: RICE.gstBps,
          minOrderQty: RICE.minOrderQty,
          items: [...residents.entries()].map(([name, r]) => ({
            orderItemId: name,
            userId: name,
            flatId: r.flatId,
            lots: r.lots,
            chargedPaise: lotsTotal(r.lots),
          })),
        },
      ],
    });
  }

  // Nine households bring the society to 45 bags (the ₹465 tier) well before cutoff.
  for (let i = 1; i <= 9; i++) setQty(`resident${i}`, `flat${i}`, 5, at(48 - i));

  return { setQty, finalize, total, residents };
}

describe("big order then cancel", () => {
  it("is blocked by the reduction freeze, so the platform absorbs nothing", () => {
    const s = society();
    expect(s.total()).toBe(45);

    // Mallory adds 10 bags 3 hours before cutoff. They're charged ₹465 (the tier before their order),
    // not the ₹440 tier their own order unlocks.
    const big = s.setQty("mallory", "flatM", 10, at(3));
    expect(big.ok && big.quote.lines[0].addUnitPaise).toBe(P465);
    expect(s.total()).toBe(55);

    // A neighbour joins at the new ₹440 price.
    const joined = s.setQty("neighbour", "flatN", 2, at(2.5));
    expect(joined.ok && joined.quote.lines[0].addUnitPaise).toBe(P440);

    // Mallory tries to pull out 2 hours before cutoff: rejected by the 12h freeze.
    const cancel = s.setQty("mallory", "flatM", 0, at(2));
    expect(cancel.ok).toBe(false);
    expect(!cancel.ok && cancel.errors[0].code).toBe("REDUCTION_FROZEN");

    const { products, totals } = s.finalize();
    const rice = products[0];
    expect(rice.totalQty).toBe(57);
    expect(rice.unit?.totalPaise).toBe(P440);
    expect(totals.absorbedPaise).toBe(0);
    const mallory = rice.items.find((i) => i.orderItemId === "mallory");
    expect(mallory?.refundPaise).toBe(10 * (P465 - P440)); // ₹250 back, same as everyone else
  });

  it("control: the same cancel before the freeze is allowed, and the platform's cost is bounded and visible", () => {
    const s = society();
    s.setQty("mallory", "flatM", 10, at(14));
    s.setQty("neighbour", "flatN", 2, at(13.5)); // buys at ₹440
    const cancel = s.setQty("mallory", "flatM", 0, at(13)); // 13h before cutoff: allowed
    expect(cancel.ok && cancel.quote.creditPaise).toBe(10 * P465); // full refund of what was paid
    expect(s.residents.get("mallory")?.wallet).toBe(10 * P465);

    const { products, totals } = s.finalize();
    expect(products[0].totalQty).toBe(47);
    expect(products[0].unit?.totalPaise).toBe(P465);
    const neighbour = products[0].items.find((i) => i.orderItemId === "neighbour");
    expect(neighbour).toMatchObject({ finalPaise: 2 * P440, refundPaise: 0, absorbedPaise: 2 * 2500 });
    expect(totals.absorbedPaise).toBe(5000); // ₹50 price-protection cost, shown in admin stats
  });

  it("with a per-flat cap of 6, the big order cannot be placed at all", () => {
    const s = society(6);
    const big = s.setQty("mallory", "flatM", 10, at(3));
    expect(big.ok).toBe(false);
    expect(!big.ok && big.errors[0]).toEqual({ code: "FLAT_CAP_EXCEEDED", roundProductId: "rice", maxAllowed: 6 });
    expect(s.total()).toBe(45);
  });
});

describe("a resident cancelling", () => {
  it("gets back what they paid, and the society total drops for everyone", () => {
    const s = society();
    const before = s.residents.get("resident9");
    const paid = lotsTotal(before?.lots ?? []);
    const result = s.setQty("resident9", "flat9", 0, at(20));
    expect(result.ok && result.quote.creditPaise).toBe(paid);
    expect(s.total()).toBe(40);
  });
});

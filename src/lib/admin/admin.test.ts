import { describe, expect, it } from "vitest";
import { payoutBlocker } from "./payouts";
import { checkSettings, DEFAULT_SETTINGS, impactAssumptionsOf } from "./settings";
import { averageRating, platformStats } from "./stats";

const HOUR = 3_600_000;
const now = new Date("2026-11-05T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * HOUR);

describe("payoutBlocker", () => {
  const service = { kind: "SERVICE" as const, status: "FINALIZED" as const, visits: [{ status: "COMPLETED", endedAt: ago(72) }, { status: "NO_ACCESS", endedAt: ago(50) }], openIssues: 0 };

  it("pays groceries once every bag is handed out", () => {
    expect(payoutBlocker({ kind: "GROCERY", status: "FINALIZED", visits: [], openIssues: 0 }, now)).toBe("NOT_HANDED_OUT");
    expect(payoutBlocker({ kind: "GROCERY", status: "COMPLETED", visits: [], openIssues: 0 }, now)).toBeNull();
    expect(payoutBlocker({ kind: "GROCERY", status: "CANCELLED", visits: [], openIssues: 0 }, now)).toBe("CANCELLED");
  });

  it("pays a Service Day once visits are done, no complaint waits and 48 hours have passed", () => {
    expect(payoutBlocker(service, now)).toBeNull();
    expect(payoutBlocker({ ...service, visits: [...service.visits, { status: "SCHEDULED", endedAt: null }] }, now)).toBe("VISITS_TO_DO");
    expect(payoutBlocker({ ...service, openIssues: 1 }, now)).toBe("COMPLAINT_OPEN");
    expect(payoutBlocker({ ...service, visits: [{ status: "COMPLETED", endedAt: ago(47) }] }, now)).toBe("COMPLAINT_WINDOW");
    expect(payoutBlocker({ ...service, status: "OPEN" }, now)).toBe("VISITS_TO_DO");
  });
});

describe("settings", () => {
  it("accepts the defaults and names out-of-range values", () => {
    expect(checkSettings(DEFAULT_SETTINGS)).toEqual([]);
    expect(checkSettings({ ...DEFAULT_SETTINGS, marginBps: 2_500, reductionFreezeMinutes: -1, impactMlPerKm: 0 })).toEqual(["MARGIN", "FREEZE", "FUEL"]);
    expect(checkSettings({ ...DEFAULT_SETTINGS, defaultNoAccessFeePaise: Number.NaN })).toEqual(["FEE"]);
  });

  it("turns stored units into impact assumptions", () => {
    expect(impactAssumptionsOf(DEFAULT_SETTINGS)).toEqual({ kmPerTrip: 8, litresPerKm: 0.04, kgCo2PerLitre: 2.3 });
  });
});

describe("platformStats", () => {
  const stats = platformStats(
    {
      rounds: [{ vertical: "GROCERIES" }, { vertical: "REPAIRS" }],
      // 2 bags: residents paid ₹1,050 (GST 5% inside: ₹1,000 taxable); vendor ₹480 a bag.
      items: [{ vertical: "GROCERIES", quantity: 2, finalPaise: 105_000, mrpPaise: 55_000, gstBps: 500, vendorUnitPaise: 48_000, absorbedPaise: 300 }],
      refunds: [
        { vertical: "GROCERIES", type: "TIER_REFUND", amountPaise: 2_000 },
        { vertical: "REPAIRS", type: "NO_ACCESS_REFUND", amountPaise: 5_000 },
        { vertical: null, type: "ADJUSTMENT", amountPaise: 9_999 }, // a top-up, not a refund
        { vertical: "GROCERIES", type: "ORDER_DEBIT", amountPaise: -105_000 },
      ],
      visits: [
        { vertical: "REPAIRS", status: "COMPLETED" },
        { vertical: "REPAIRS", status: "NO_ACCESS" },
      ],
      ratings: [
        { vertical: "REPAIRS", stars: 5 },
        { vertical: "REPAIRS", stars: 4 },
      ],
      polls: [{ status: "CONVERTED" }, { status: "OPEN" }, { status: "CLOSED" }, { status: "SUGGESTED" }],
    },
    ["GROCERIES", "HOME_SERVICES", "REPAIRS", "SUBSCRIPTIONS"],
  );

  it("adds up money per vertical and in total", () => {
    const groceries = stats.verticals[0];
    expect(groceries).toMatchObject({ rounds: 1, gmvPaise: 105_000, savedPaise: 5_000, marginPaise: 100_000 - 96_000, absorbedPaise: 300, refundsPaise: 2_000 });
    expect(stats.total.refundsPaise).toBe(7_000);
    expect(stats.refundsByType).toMatchObject({ TIER_REFUND: 2_000, NO_ACCESS_REFUND: 5_000 });
  });

  it("counts visits, ratings and poll conversion", () => {
    const repairs = stats.verticals[2];
    expect(repairs).toMatchObject({ visitsCompleted: 1, ratingCount: 2 });
    expect(averageRating(repairs)).toBe(4.5);
    expect(averageRating(stats.verticals[1])).toBeNull();
    expect(stats.polls).toEqual({ total: 3, converted: 1, rate: 1 / 3 });
  });
});

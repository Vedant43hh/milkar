import { describe, expect, it } from "vitest";
import { allowedServiceCategories, checkOption, checkProduct, checkService, highestResidentPrice, sellsProducts } from "./catalogue";
import { earningsSummary, vendorPayout } from "./payout";
import { csvField, csvRupees, purchaseOrderCsv } from "./purchase-order";
import { checkReassign, groupSchedule, overlaps } from "./schedule";
import { checkSlot, minutesOf } from "./slot-templates";
import { readTierRows, residentPrices, rupeesText, tierRowsFor } from "./tier-editor";

describe("vendorPayout", () => {
  it("is the order plus every adjustment, grouped by kind", () => {
    const payout = vendorPayout({
      totalPaise: 100_000,
      adjustments: [
        { type: "NO_ACCESS_FEE", amountPaise: -8_000 },
        { type: "PARTS", amountPaise: 45_000 },
        { type: "ISSUE_REFUND", amountPaise: -1_180 },
        { type: "ISSUE_REFUND", amountPaise: -2_360 },
      ],
    });
    expect(payout.payoutPaise).toBe(100_000 - 8_000 + 45_000 - 1_180 - 2_360);
    expect(payout.adjustmentsPaise).toBe(payout.payoutPaise - 100_000);
    expect(payout.changes).toEqual([
      { type: "NO_ACCESS_FEE", amountPaise: -8_000, count: 1 },
      { type: "ISSUE_REFUND", amountPaise: -3_540, count: 2 },
      { type: "PARTS", amountPaise: 45_000, count: 1 },
    ]);
  });

  it("leaves out kinds that cancel to nothing (parts paid, then refunded)", () => {
    const payout = vendorPayout({ totalPaise: 50_000, adjustments: [{ type: "PARTS", amountPaise: 0 }] });
    expect(payout.changes).toEqual([]);
    expect(payout.payoutPaise).toBe(50_000);
  });

  it("sums what's owed and what's been paid", () => {
    expect(
      earningsSummary([
        { status: "ISSUED", payoutPaise: 1_000 },
        { status: "ACKNOWLEDGED", payoutPaise: 2_000 },
        { status: "PAID", payoutPaise: 4_000 },
      ]),
    ).toEqual({ owedPaise: 3_000, paidPaise: 4_000, toAcknowledge: 1 });
  });
});

describe("readTierRows", () => {
  const rows = (...pairs: [string, string][]) => pairs.map(([from, price]) => ({ from, price }));

  it("reads rupees into paise, sorted, ignoring blank rows", () => {
    expect(readTierRows(rows(["20", "455.50"], ["", ""], ["1", "₹ 480"], ["50", "1,440"].reverse() as [string, string]))).toEqual({
      ok: false,
      problems: [{ row: 4, problem: "BAD_FROM" }],
    });
    expect(readTierRows(rows(["20", "455.50"], ["", ""], ["1", "₹ 480"]))).toEqual({
      ok: true,
      tiers: [
        { minQty: 1, vendorPricePaise: 48_000 },
        { minQty: 20, vendorPricePaise: 45_550 },
      ],
    });
  });

  it("needs a first tier from 1, distinct starts, and lower prices for more", () => {
    expect(readTierRows(rows(["", ""]))).toEqual({ ok: false, problems: [{ row: null, problem: "NO_TIERS" }] });
    expect(readTierRows(rows(["5", "100"]))).toEqual({ ok: false, problems: [{ row: 1, problem: "FIRST_NOT_ONE" }] });
    expect(readTierRows(rows(["1", "100"], ["1", "90"]))).toEqual({ ok: false, problems: [{ row: 2, problem: "DUPLICATE_FROM" }] });
    expect(readTierRows(rows(["1", "100"], ["10", "100"]))).toEqual({ ok: false, problems: [{ row: 2, problem: "NOT_CHEAPER" }] });
    expect(readTierRows(rows(["1", "0"], ["x", "90"]))).toEqual({
      ok: false,
      problems: [
        { row: 1, problem: "BAD_PRICE" },
        { row: 2, problem: "BAD_FROM" },
      ],
    });
    expect(readTierRows(rows(["1", "12.345"]))).toEqual({ ok: false, problems: [{ row: 1, problem: "BAD_PRICE" }] });
    expect(readTierRows(rows(...Array.from({ length: 7 }, (_, i) => [String(i + 1), String(100 - i)] as [string, string])))).toEqual({
      ok: false,
      problems: [{ row: null, problem: "TOO_MANY" }],
    });
  });

  it("shows residents' prices: vendor price, plus margin, plus GST", () => {
    // ₹100 + 3% margin = ₹103, + 5% GST = ₹108.15
    expect(residentPrices([{ minQty: 1, vendorPricePaise: 10_000 }], 300, 500)).toEqual([{ minQty: 1, vendorPaise: 10_000, residentPaise: 10_815 }]);
  });

  it("fills the editor with saved tiers and room for more", () => {
    expect(tierRowsFor([{ minQty: 1, vendorPricePaise: 46_550 }])).toEqual([
      { from: "1", price: "465.50" },
      { from: "", price: "" },
      { from: "", price: "" },
      { from: "", price: "" },
    ]);
    expect(tierRowsFor(Array.from({ length: 6 }, (_, i) => ({ minQty: i + 1, vendorPricePaise: 1000 - i })))).toHaveLength(6);
    expect(rupeesText(48_000)).toBe("480");
  });
});

describe("groupSchedule", () => {
  const at = (h: number, day = 27) => new Date(Date.UTC(2026, 9, day, h - 5, -30)); // IST hours
  const visit = (id: string, h: number, tower: string, flatNumber: string, day = 27) => ({ id, startsAt: at(h, day), endsAt: at(h + 2, day), tower, flatNumber, community: "Green Meadows" });

  it("groups by day, slot, tower and flat, in natural order", () => {
    const days = groupSchedule([visit("a", 11, "B", "10"), visit("b", 9, "A", "10"), visit("c", 9, "A", "2"), visit("d", 9, "A10", "1"), visit("e", 9, "A2", "1"), visit("f", 9, "A", "1", 28)]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-27", "2026-10-28"]);
    const [first] = days;
    expect(first.slots.map((s) => s.startsAt.toISOString())).toEqual([at(9).toISOString(), at(11).toISOString()]);
    expect(first.slots[0].towers.map((t) => t.tower)).toEqual(["A", "A2", "A10"]);
    expect(first.slots[0].towers[0].visits.map((v) => v.id)).toEqual(["c", "b"]);
  });

  it("reassigns only scheduled visits, to someone free then", () => {
    const v = { status: "SCHEDULED", startsAt: at(9), endsAt: at(11), technicianId: "t1" };
    expect(checkReassign(v, { technicianId: "t2", otherVisits: [] })).toBeNull();
    expect(checkReassign(v, { technicianId: "t1", otherVisits: [] })).toBe("SAME_TECHNICIAN");
    expect(checkReassign({ ...v, status: "ON_THE_WAY" }, { technicianId: "t2", otherVisits: [] })).toBe("NOT_SCHEDULED");
    expect(checkReassign(v, { technicianId: "t2", otherVisits: [{ status: "SCHEDULED", startsAt: at(10), endsAt: at(12) }] })).toBe("BUSY");
    // Back to back is fine, and so is a slot freed by a cancelled visit.
    expect(checkReassign(v, { technicianId: "t2", otherVisits: [{ status: "SCHEDULED", startsAt: at(11), endsAt: at(13) }] })).toBeNull();
    expect(checkReassign(v, { technicianId: "t2", otherVisits: [{ status: "CANCELLED", startsAt: at(9), endsAt: at(11) }] })).toBeNull();
    expect(overlaps({ startsAt: at(9), endsAt: at(11) }, { startsAt: at(10), endsAt: at(10) })).toBe(true);
  });
});

describe("checkSlot", () => {
  const slot = (startTime: string, endTime: string, technicians = 2) => ({ startTime, endTime, technicians });

  it("needs real times, at least half an hour, and some technicians", () => {
    expect(minutesOf("09:30")).toBe(570);
    expect(checkSlot(slot("9:00", "11:00"), [])).toBe("BAD_TIME");
    expect(checkSlot(slot("11:00", "09:00"), [])).toBe("END_BEFORE_START");
    expect(checkSlot(slot("09:00", "09:15"), [])).toBe("TOO_SHORT");
    expect(checkSlot(slot("09:00", "11:00", 0), [])).toBe("BAD_TECHNICIANS");
    expect(checkSlot(slot("09:00", "11:00"), [])).toBeNull();
  });

  it("doesn't overlap the service's other slots", () => {
    expect(checkSlot(slot("10:00", "12:00"), [slot("09:00", "11:00")])).toBe("OVERLAP");
    expect(checkSlot(slot("11:00", "13:00"), [slot("09:00", "11:00")])).toBeNull();
    expect(checkSlot(slot("20:00", "21:00"), Array.from({ length: 8 }, (_, i) => slot(`0${i}:00`, `0${i}:30`)))).toBe("TOO_MANY");
  });
});

describe("purchaseOrderCsv", () => {
  it("writes rupees as plain numbers and quotes what needs quoting", () => {
    expect(csvRupees(46_550)).toBe("465.50");
    expect(csvRupees(-118)).toBe("-1.18");
    expect(csvField('Atta, "Chakki"')).toBe('"Atta, ""Chakki"""');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-1.18")).toBe("-1.18");
  });

  it("has the header, a row per line and the totals", () => {
    const csv = purchaseOrderCsv({
      number: 12,
      round: "Weekend staples",
      community: "Green Meadows CHS",
      deliverBy: "27 Oct 2026, 10:00 am",
      lines: [{ item: "Basmati rice", detail: "5 kg bag", quantity: 22, vendorPricePaise: 45_000, gstBps: 500, taxablePaise: 990_000, gstPaise: 49_500, lineTotalPaise: 1_039_500 }],
      subtotalPaise: 990_000,
      gstPaise: 49_500,
      totalPaise: 1_039_500,
    });
    expect(csv.startsWith("﻿Purchase order,PO-12\r\n")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toContain("Basmati rice,5 kg bag,22,450.00,5%,9900.00,495.00,10395.00");
    expect(lines.at(-1)).toBe(",,,,Total,,,10395.00");
  });
});

describe("catalogue checks", () => {
  const product = {
    name: "Sona Masoori Rice",
    category: "GRAINS_FLOUR",
    unit: "KG",
    packSize: 5,
    mrpPaise: 55_000,
    gstBps: 500,
    minOrderQty: 10,
    maxPerFlat: 4,
    tiers: [
      { minQty: 1, vendorPricePaise: 46_000 },
      { minQty: 20, vendorPricePaise: 43_000 },
    ],
  };

  it("accepts a sound product and names each problem", () => {
    expect(checkProduct(product, 300)).toEqual([]);
    expect(checkProduct({ ...product, name: "R", unit: "TONNE", gstBps: 1200, maxPerFlat: 0 }, 300)).toEqual(["NAME", "UNIT", "GST", "MAX_PER_FLAT"]);
    expect(checkProduct({ ...product, packSize: Number.NaN, minOrderQty: 0 }, 300)).toEqual(["PACK_SIZE", "MIN_ORDER"]);
    expect(checkProduct({ ...product, tiers: [{ minQty: 2, vendorPricePaise: 100 }] }, 300)).toEqual(["TIERS"]);
  });

  it("never lets residents pay more than the MRP", () => {
    // ₹509.50 + 3% = ₹524.79, + 5% GST = ₹551.03: just over ₹550.
    expect(highestResidentPrice([{ minQty: 1, vendorPricePaise: 50_950 }], 300, 500)).toBe(55_103);
    expect(checkProduct({ ...product, tiers: [{ minQty: 1, vendorPricePaise: 50_950 }] }, 300)).toEqual(["ABOVE_MRP"]);
    expect(checkProduct({ ...product, tiers: [{ minQty: 1, vendorPricePaise: 50_850 }] }, 300)).toEqual([]);
  });

  it("offers upkeep to home-services vendors and repairs to repair vendors", () => {
    expect(sellsProducts(["GROCERIES"])).toBe(true);
    expect(sellsProducts(["REPAIRS"])).toBe(false);
    expect(allowedServiceCategories(["REPAIRS"])).toEqual(["APPLIANCE_REPAIR", "PLUMBER", "ELECTRICIAN", "CARPENTER", "PAINTER"]);
    expect(allowedServiceCategories(["HOME_SERVICES"])).not.toContain("PLUMBER");
    expect(allowedServiceCategories(["GROCERIES"])).toEqual([]);
  });

  it("checks services and their options", () => {
    const service = { name: "Sofa shampoo", category: "SOFA_CARPET", description: "Vacuum, shampoo and dry.", minFlats: 6, noAccessFeePaise: 9_900, durationMinutes: 90, gstBps: 1800, weeklyByDefault: false };
    expect(checkService(service, allowedServiceCategories(["HOME_SERVICES"]))).toEqual([]);
    expect(checkService({ ...service, category: "PLUMBER", description: "Short", durationMinutes: 5, noAccessFeePaise: -1 }, allowedServiceCategories(["HOME_SERVICES"]))).toEqual(["CATEGORY", "DESCRIPTION", "FEE", "DURATION"]);
    const option = { name: "3-seater", unitLabel: "sofa", mrpPaise: 99_900, maxPerFlat: 2, tiers: [{ minQty: 1, vendorPricePaise: 70_000 }] };
    expect(checkOption(option, 300, 1800)).toEqual([]);
    expect(checkOption({ ...option, unitLabel: "2 sofas", tiers: [{ minQty: 1, vendorPricePaise: 90_000 }] }, 300, 1800)).toEqual(["UNIT_LABEL", "ABOVE_MRP"]);
  });
});

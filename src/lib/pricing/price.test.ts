import { describe, expect, it } from "vitest";
import { splitInclusive, vendorPriceForTotal, unitPrice, unitPriceAt } from "./price";
import { MARGIN_BPS, P440, P465, P500, RICE, RICE_GST_BPS } from "./test-fixtures";

describe("unitPrice", () => {
  it("adds margin on the vendor price, then GST on vendor price + margin", () => {
    expect(unitPrice(46232, MARGIN_BPS, RICE_GST_BPS)).toEqual({
      vendorPaise: 46232,
      marginPaise: 1387, // 3% of 46232 = 1386.96
      taxablePaise: 47619,
      gstPaise: 2381, // 5% of 47619 = 2380.95
      totalPaise: P500,
    });
  });

  it("reproduces the brief's ₹500 / ₹465 / ₹440 ladder", () => {
    expect(unitPriceAt(RICE, 1).totalPaise).toBe(P500);
    expect(unitPriceAt(RICE, 19).totalPaise).toBe(P500);
    expect(unitPriceAt(RICE, 20).totalPaise).toBe(P465);
    expect(unitPriceAt(RICE, 50).totalPaise).toBe(P440);
  });

  it("handles 0% and 18% GST", () => {
    expect(unitPrice(10000, 300, 0).totalPaise).toBe(10300);
    expect(unitPrice(10000, 300, 1800)).toMatchObject({ taxablePaise: 10300, gstPaise: 1854, totalPaise: 12154 });
  });
});

describe("vendorPriceForTotal", () => {
  it("finds the vendor price that gives a target resident price", () => {
    expect(vendorPriceForTotal(P500, MARGIN_BPS, RICE_GST_BPS)).toBe(46232);
    expect(vendorPriceForTotal(P465, MARGIN_BPS, RICE_GST_BPS)).toBe(42996);
    expect(vendorPriceForTotal(P440, MARGIN_BPS, RICE_GST_BPS)).toBe(40684);
  });

  it("never exceeds the target", () => {
    for (const target of [9900, 12345, 99999, 250000]) {
      for (const gst of [0, 500, 1200, 1800]) {
        const s = vendorPriceForTotal(target, MARGIN_BPS, gst);
        expect(unitPrice(s, MARGIN_BPS, gst).totalPaise).toBeLessThanOrEqual(target);
        expect(unitPrice(s + 1, MARGIN_BPS, gst).totalPaise).toBeGreaterThan(target);
      }
    }
  });
});

describe("splitInclusive", () => {
  it("backs GST out of an inclusive amount", () => {
    expect(splitInclusive(44000, 500)).toEqual({ taxablePaise: 41905, gstPaise: 2095 });
    expect(splitInclusive(11800, 1800)).toEqual({ taxablePaise: 10000, gstPaise: 1800 });
  });

  it("always sums back to the amount", () => {
    for (const amount of [1, 99, 12345, 88000, 1234567]) {
      for (const gst of [0, 500, 1200, 1800]) {
        const { taxablePaise, gstPaise } = splitInclusive(amount, gst);
        expect(taxablePaise + gstPaise).toBe(amount);
        expect(gstPaise).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

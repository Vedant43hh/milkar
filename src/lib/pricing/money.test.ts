import { describe, expect, it } from "vitest";
import { applyBps, formatBps, formatINR, parseRupeesToPaise, sumPaise } from "./money";

describe("applyBps", () => {
  it("computes percentages in basis points", () => {
    expect(applyBps(100000, 500)).toBe(5000); // 5% of ₹1,000
    expect(applyBps(46232, 300)).toBe(1387); // 1386.96 → 1387
  });

  it("rounds half up", () => {
    expect(applyBps(5, 5000)).toBe(3); // 2.5 → 3
    expect(applyBps(4655, 300)).toBe(140); // 139.65 → 140
    expect(applyBps(1, 4999)).toBe(0); // 0.4999 → 0
  });

  it("handles zero", () => {
    expect(applyBps(0, 500)).toBe(0);
    expect(applyBps(50000, 0)).toBe(0);
  });

  it("rejects floats and negatives", () => {
    expect(() => applyBps(10.5, 500)).toThrow(RangeError);
    expect(() => applyBps(1000, 2.5)).toThrow(RangeError);
    expect(() => applyBps(-100, 500)).toThrow(RangeError);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(10000000)).toBe("₹1,00,000");
    expect(formatINR(1234567800)).toBe("₹1,23,45,678");
    expect(formatINR(12345678901)).toBe("₹12,34,56,789.01");
  });

  it("shows paise only when non-zero by default", () => {
    expect(formatINR(50000)).toBe("₹500");
    expect(formatINR(46550)).toBe("₹465.50");
    expect(formatINR(5)).toBe("₹0.05");
    expect(formatINR(0)).toBe("₹0");
  });

  it("supports always/never display", () => {
    expect(formatINR(50000, "always")).toBe("₹500.00");
    expect(formatINR(46550, "never")).toBe("₹466");
    expect(formatINR(46549, "never")).toBe("₹465");
  });

  it("formats negative amounts", () => {
    expect(formatINR(-124000)).toBe("-₹1,240");
  });
});

describe("parseRupeesToPaise", () => {
  it("parses rupee strings without floating point", () => {
    expect(parseRupeesToPaise("465")).toBe(46500);
    expect(parseRupeesToPaise("465.5")).toBe(46550);
    expect(parseRupeesToPaise("0.07")).toBe(7);
    expect(parseRupeesToPaise("₹1,00,000.75")).toBe(10000075);
  });

  it("rejects invalid amounts", () => {
    expect(() => parseRupeesToPaise("4.555")).toThrow();
    expect(() => parseRupeesToPaise("-5")).toThrow();
    expect(() => parseRupeesToPaise("abc")).toThrow();
  });
});

describe("formatBps / sumPaise", () => {
  it("formats basis points as percentages", () => {
    expect(formatBps(500)).toBe("5%");
    expect(formatBps(1800)).toBe("18%");
    expect(formatBps(250)).toBe("2.5%");
    expect(formatBps(205)).toBe("2.05%");
  });

  it("sums integer paise", () => {
    expect(sumPaise([100, 250, 5])).toBe(355);
    expect(() => sumPaise([1, 0.5])).toThrow(RangeError);
  });
});

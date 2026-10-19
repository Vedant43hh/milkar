import { describe, expect, it } from "vitest";
import { allocateNoAccessRefunds, noAccessRefund, noAccessRefundKey, noAccessVendorAdjustment } from "./no-access";

describe("noAccessRefund", () => {
  it("refunds what was paid minus the visit fee", () => {
    expect(noAccessRefund(109800, 14900)).toEqual({ refundPaise: 94900, feeKeptPaise: 14900 });
  });

  it("never goes below zero when the fee is more than was paid", () => {
    expect(noAccessRefund(10000, 14900)).toEqual({ refundPaise: 0, feeKeptPaise: 10000 });
    expect(noAccessRefund(0, 14900)).toEqual({ refundPaise: 0, feeKeptPaise: 0 });
  });

  it("refunds everything when there is no fee", () => {
    expect(noAccessRefund(54900, 0)).toEqual({ refundPaise: 54900, feeKeptPaise: 0 });
  });

  it("rejects negative amounts", () => {
    expect(() => noAccessRefund(-1, 0)).toThrow();
  });
});

describe("allocateNoAccessRefunds", () => {
  it("takes the fee once per visit, from the largest payment first", () => {
    const refunds = allocateNoAccessRefunds(
      [
        { orderItemId: "spouse", userId: "u2", paidPaise: 54900 },
        { orderItemId: "booker", userId: "u1", paidPaise: 109800 },
      ],
      14900,
    );
    expect(refunds.map((r) => [r.orderItemId, r.refundPaise])).toEqual([
      ["spouse", 54900],
      ["booker", 94900],
    ]);
    expect(refunds.reduce((s, r) => s + r.refundPaise, 0)).toBe(noAccessRefund(164700, 14900).refundPaise);
  });

  it("spreads a fee larger than one payment across items", () => {
    const refunds = allocateNoAccessRefunds(
      [
        { orderItemId: "a", userId: "u1", paidPaise: 10000 },
        { orderItemId: "b", userId: "u2", paidPaise: 10000 },
      ],
      14900,
    );
    expect(refunds.map((r) => r.refundPaise)).toEqual([0, 5100]);
  });
});

describe("vendor side", () => {
  it("is paid the fee instead of the job", () => {
    expect(noAccessVendorAdjustment(90340, 14900)).toBe(-75440);
  });

  it("keys refunds per visit and order item, so marking no-access twice credits once", () => {
    expect(noAccessRefundKey("v1", "i1")).toBe("NO_ACCESS_REFUND:v1:i1");
  });
});

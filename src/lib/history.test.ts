import { describe, expect, it } from "vitest";
import { roundMoney } from "./history";

describe("roundMoney", () => {
  it("adds up paid payments and the credits that came back", () => {
    const money = roundMoney(
      [
        { status: "PAID", chargePaise: 93000 },
        { status: "PAID", chargePaise: 46500 },
        { status: "EXPIRED", chargePaise: 50000 }, // never paid
        { status: "FAILED", chargePaise: 50000 },
      ],
      [
        { type: "ORDER_DEBIT", amountPaise: -46500 }, // wallet spent on the second payment: part of paid
        { type: "CANCEL_REFUND", amountPaise: 46500 },
        { type: "TIER_REFUND", amountPaise: 5000 },
        { type: "TIER_REFUND", amountPaise: 2500 },
        { type: "SHORT_DELIVERY_REFUND", amountPaise: 46500 },
      ],
    );
    expect(money).toEqual({
      paidPaise: 139500,
      refundedPaise: 100500,
      netPaise: 39000,
      refunds: [
        { type: "CANCEL_REFUND", amountPaise: 46500 },
        { type: "SHORT_DELIVERY_REFUND", amountPaise: 46500 },
        { type: "TIER_REFUND", amountPaise: 7500 },
      ],
    });
  });

  it("leaves out a late payment that went to the wallet instead", () => {
    const money = roundMoney([{ status: "CREDITED_TO_WALLET", chargePaise: 40000 }], [{ type: "LATE_PAYMENT_CREDIT", amountPaise: 40000 }]);
    expect(money).toEqual({ paidPaise: 0, refundedPaise: 0, netPaise: 0, refunds: [] });
  });

  it("nets to zero when a cancelled round refunds everything", () => {
    const money = roundMoney([{ status: "PAID", chargePaise: 299900 }], [{ type: "ROUND_CANCEL_REFUND", amountPaise: 299900 }]);
    expect(money.netPaise).toBe(0);
  });
});

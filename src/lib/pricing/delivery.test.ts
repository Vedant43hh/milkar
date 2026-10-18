import { describe, expect, it } from "vitest";
import { deliveryIssueRefund, shortDeliveryRefundKey } from "./delivery";
import { P440, P465, P500 } from "./test-fixtures";

// Bought 2 at ₹500 and 3 at ₹440; final price ₹465 → units finally cost 465, 465, 440, 440, 440.
const lots = [
  { quantity: 2, unitPricePaise: P500, seq: 1 },
  { quantity: 3, unitPricePaise: P440, seq: 2 },
];

describe("deliveryIssueRefund", () => {
  it("refunds the highest final unit amounts first", () => {
    expect(deliveryIssueRefund(lots, P465, 0, 1)).toBe(P465);
    expect(deliveryIssueRefund(lots, P465, 1, 3)).toBe(P465 + P440);
    expect(deliveryIssueRefund(lots, P465, 0, 5)).toBe(2 * P465 + 3 * P440);
  });

  it("adds up across successive reports", () => {
    const stepwise =
      deliveryIssueRefund(lots, P465, 0, 1) +
      deliveryIssueRefund(lots, P465, 1, 2) +
      deliveryIssueRefund(lots, P465, 2, 5);
    expect(stepwise).toBe(deliveryIssueRefund(lots, P465, 0, 5));
  });

  it("refunds nothing when the same cumulative quantity is submitted again", () => {
    expect(deliveryIssueRefund(lots, P465, 2, 2)).toBe(0);
  });

  it("only allows the quantity to increase, up to what was ordered", () => {
    expect(() => deliveryIssueRefund(lots, P465, 3, 2)).toThrow(RangeError);
    expect(() => deliveryIssueRefund(lots, P465, 0, 6)).toThrow(RangeError);
  });

  it("builds an idempotency key per cumulative quantity", () => {
    expect(shortDeliveryRefundKey("item1", 2)).toBe("SHORT_DELIVERY_REFUND:item1:2");
  });
});

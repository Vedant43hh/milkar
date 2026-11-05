// What Milkar owes a vendor for a round. Pure.
//
// A vendor order is issued at cutoff: the confirmed quantities at the vendor's tier price, plus GST.
// Afterwards, adjustments move what is paid: a no-access visit (the job isn't paid, the visit fee
// is), a cancelled visit, goods refunded as short or damaged, parts paid for at cost.

import { assertSafeInt, sumPaise } from "../pricing/money";

export type AdjustmentType = "NO_ACCESS_FEE" | "VISIT_CANCELLED" | "ISSUE_REFUND" | "PARTS";
export const ADJUSTMENT_TYPES: readonly AdjustmentType[] = ["NO_ACCESS_FEE", "VISIT_CANCELLED", "ISSUE_REFUND", "PARTS"];

export type PayoutStatus = "ISSUED" | "ACKNOWLEDGED" | "PAID";

export type PayoutInput = {
  totalPaise: number;
  adjustments: readonly { type: AdjustmentType; amountPaise: number }[];
};

export type Payout = {
  /** The order as issued, GST included. */
  orderPaise: number;
  /** Each kind of change with its total, in a fixed order; kinds that add up to nothing are left out. */
  changes: { type: AdjustmentType; amountPaise: number; count: number }[];
  adjustmentsPaise: number;
  /** What the vendor is paid. */
  payoutPaise: number;
};

export function vendorPayout(order: PayoutInput): Payout {
  assertSafeInt(order.totalPaise, "totalPaise");
  const changes = ADJUSTMENT_TYPES.map((type) => {
    const ofType = order.adjustments.filter((a) => a.type === type);
    return { type, amountPaise: sumPaise(ofType.map((a) => a.amountPaise)), count: ofType.length };
  }).filter((c) => c.count > 0 && c.amountPaise !== 0);
  const adjustmentsPaise = sumPaise(changes.map((c) => c.amountPaise));
  return { orderPaise: order.totalPaise, changes, adjustmentsPaise, payoutPaise: order.totalPaise + adjustmentsPaise };
}

export type EarningsSummary = {
  /** Issued or acknowledged, not paid yet. */
  owedPaise: number;
  paidPaise: number;
  /** Orders still to acknowledge. */
  toAcknowledge: number;
};

export function earningsSummary(orders: readonly { status: PayoutStatus; payoutPaise: number }[]): EarningsSummary {
  const unpaid = orders.filter((o) => o.status !== "PAID");
  return {
    owedPaise: sumPaise(unpaid.map((o) => o.payoutPaise)),
    paidPaise: sumPaise(orders.filter((o) => o.status === "PAID").map((o) => o.payoutPaise)),
    toAcknowledge: orders.filter((o) => o.status === "ISSUED").length,
  };
}

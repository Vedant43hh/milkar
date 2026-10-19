// Money when a technician cannot get in (NO_ACCESS) or a visit is cancelled. Pure.
import { assertSafeInt } from "../pricing/money";

/** The resident gets back what they paid minus the visit fee, never below zero. */
export function noAccessRefund(paidPaise: number, feePaise: number): { refundPaise: number; feeKeptPaise: number } {
  assertSafeInt(paidPaise, "paidPaise");
  assertSafeInt(feePaise, "feePaise");
  if (paidPaise < 0 || feePaise < 0) throw new RangeError("amounts must be >= 0");
  const feeKeptPaise = Math.min(feePaise, paidPaise);
  return { refundPaise: paidPaise - feeKeptPaise, feeKeptPaise };
}

export type PaidItem = { orderItemId: string; userId: string; paidPaise: number };

/**
 * Splits a no-access refund across the order items of one visit (family members each paid for
 * their own units). The visit fee is taken once per visit, from the largest payments first, so
 * the total refunded is exactly noAccessRefund(total paid, fee).
 */
export function allocateNoAccessRefunds(items: readonly PaidItem[], feePaise: number): (PaidItem & { refundPaise: number })[] {
  const order = [...items].sort((a, b) => b.paidPaise - a.paidPaise || a.orderItemId.localeCompare(b.orderItemId));
  let feeLeft = feePaise;
  const refunds = new Map<string, number>();
  for (const item of order) {
    const { refundPaise, feeKeptPaise } = noAccessRefund(item.paidPaise, feeLeft);
    feeLeft -= feeKeptPaise;
    refunds.set(item.orderItemId, refundPaise);
  }
  return items.map((item) => ({ ...item, refundPaise: refunds.get(item.orderItemId) ?? 0 }));
}

/**
 * Change to the vendor's payout for a no-access visit: they are not paid for the job but keep
 * the visit fee. Negative means the vendor is paid less than the issued order.
 */
export function noAccessVendorAdjustment(jobVendorValuePaise: number, feeKeptPaise: number): number {
  assertSafeInt(jobVendorValuePaise, "jobVendorValuePaise");
  return feeKeptPaise - jobVendorValuePaise;
}

export const noAccessRefundKey = (visitId: string, orderItemId: string) => `NO_ACCESS_REFUND:${visitId}:${orderItemId}`;
export const visitCancelRefundKey = (visitId: string, orderItemId: string) => `VISIT_CANCEL_REFUND:${visitId}:${orderItemId}`;

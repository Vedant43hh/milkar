import { assertSafeInt } from "./money";
import { lotsQty, protectedUnitPaise, type Lot } from "./lots";

/**
 * Refund for units reported short or damaged at distribution.
 *
 * The captain records the cumulative number of problem units for an order item; only increases
 * are allowed. Units are refunded at their final per-unit amount (min(lot price, final price)),
 * highest first, so the refund for units prevIssueQty..newIssueQty is deterministic and
 * re-submitting the same cumulative value refunds nothing.
 */
export function deliveryIssueRefund(
  lots: readonly Lot[],
  finalUnitPaise: number,
  prevIssueQty: number,
  newIssueQty: number,
): number {
  assertSafeInt(prevIssueQty, "prevIssueQty");
  assertSafeInt(newIssueQty, "newIssueQty");
  const qty = lotsQty(lots);
  if (prevIssueQty < 0 || newIssueQty < prevIssueQty) {
    throw new RangeError("Short/damaged quantity can only increase");
  }
  if (newIssueQty > qty) throw new RangeError("Cannot report more units than were ordered");

  const runs = lots
    .map((lot) => ({ units: lot.quantity, unitPaise: protectedUnitPaise(lot, finalUnitPaise) }))
    .sort((a, b) => b.unitPaise - a.unitPaise);

  let refund = 0;
  let position = 0;
  for (const run of runs) {
    const start = Math.max(prevIssueQty, position);
    const end = Math.min(newIssueQty, position + run.units);
    if (end > start) refund += (end - start) * run.unitPaise;
    position += run.units;
  }
  return refund;
}

export function shortDeliveryRefundKey(orderItemId: string, cumulativeIssueQty: number): string {
  return `SHORT_DELIVERY_REFUND:${orderItemId}:${cumulativeIssueQty}`;
}

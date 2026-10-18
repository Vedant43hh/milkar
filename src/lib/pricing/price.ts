import { applyBps, assertSafeInt } from "./money";
import { tierAt, type Tier } from "./tiers";

/**
 * Resident price for one unit.
 * supplier (GST-exclusive tier price) + platform margin = taxable value; GST is charged on the taxable value.
 */
export type UnitPrice = {
  supplierPaise: number;
  marginPaise: number;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
};

export function unitPrice(supplierPaise: number, marginBps: number, gstBps: number): UnitPrice {
  assertSafeInt(supplierPaise, "supplierPaise");
  const marginPaise = applyBps(supplierPaise, marginBps);
  const taxablePaise = supplierPaise + marginPaise;
  const gstPaise = applyBps(taxablePaise, gstBps);
  return {
    supplierPaise,
    marginPaise,
    taxablePaise,
    gstPaise,
    totalPaise: taxablePaise + gstPaise,
  };
}

export type ProductPricing = {
  tiers: readonly Tier[];
  marginBps: number;
  gstBps: number;
};

/** Resident unit price at a society-wide quantity. */
export function unitPriceAtQty(product: ProductPricing, societyQty: number): UnitPrice {
  const tier = tierAt(product.tiers, societyQty);
  return unitPrice(tier.supplierPricePaise, product.marginBps, product.gstBps);
}

/**
 * Largest supplier price whose resident total does not exceed `targetTotalPaise`.
 * Lets seed data and supplier tooling start from the price residents should see.
 */
export function supplierPriceForTotal(targetTotalPaise: number, marginBps: number, gstBps: number): number {
  assertSafeInt(targetTotalPaise, "targetTotalPaise");
  let s = Math.floor((targetTotalPaise * 10000 * 10000) / ((10000 + marginBps) * (10000 + gstBps)));
  while (unitPrice(s + 1, marginBps, gstBps).totalPaise <= targetTotalPaise) s++;
  while (s > 0 && unitPrice(s, marginBps, gstBps).totalPaise > targetTotalPaise) s--;
  return s;
}

/**
 * Splits a GST-inclusive amount into taxable value and GST for invoices.
 * Used on actual final amounts, so it stays correct when price protection or refunds applied.
 */
export function splitInclusive(amountPaise: number, gstBps: number): { taxablePaise: number; gstPaise: number } {
  assertSafeInt(amountPaise, "amountPaise");
  assertSafeInt(gstBps, "gstBps");
  const numerator = amountPaise * 10000;
  const denominator = 10000 + gstBps;
  assertSafeInt(numerator, "amountPaise * 10000");
  // Round half up.
  const taxablePaise = Math.floor((2 * numerator + denominator) / (2 * denominator));
  return { taxablePaise, gstPaise: amountPaise - taxablePaise };
}

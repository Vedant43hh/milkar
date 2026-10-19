import { applyBps, assertSafeInt } from "./money";
import { tierAt, type Tier } from "./tiers";

/**
 * Resident price for one unit.
 * vendor price (GST-exclusive tier price) + platform margin = taxable value; GST is charged on the taxable value.
 */
export type UnitPrice = {
  vendorPaise: number;
  marginPaise: number;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
};

export function unitPrice(vendorPaise: number, marginBps: number, gstBps: number): UnitPrice {
  assertSafeInt(vendorPaise, "vendorPaise");
  const marginPaise = applyBps(vendorPaise, marginBps);
  const taxablePaise = vendorPaise + marginPaise;
  const gstPaise = applyBps(taxablePaise, gstBps);
  return {
    vendorPaise,
    marginPaise,
    taxablePaise,
    gstPaise,
    totalPaise: taxablePaise + gstPaise,
  };
}

export type OfferingPricing = {
  tiers: readonly Tier[];
  marginBps: number;
  gstBps: number;
};

/** Resident unit price once the offering's tier group reaches `basisCount` (units or flats). */
export function unitPriceAt(pricing: OfferingPricing, basisCount: number): UnitPrice {
  const tier = tierAt(pricing.tiers, basisCount);
  return unitPrice(tier.vendorPricePaise, pricing.marginBps, pricing.gstBps);
}

/**
 * Largest vendor price whose resident total does not exceed `targetTotalPaise`.
 * Lets seed data and vendor tooling start from the price residents should see.
 */
export function vendorPriceForTotal(targetTotalPaise: number, marginBps: number, gstBps: number): number {
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

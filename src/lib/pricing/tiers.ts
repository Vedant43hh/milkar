import { assertSafeInt } from "./money";

/**
 * Vendor price per unit (GST-exclusive) once the tier group's count reaches minQty. The count is
 * in the group's basis: units bought (groceries) or distinct flats booked (services).
 */
export type Tier = {
  minQty: number;
  vendorPricePaise: number;
};

export function sortTiers(tiers: readonly Tier[]): Tier[] {
  return [...tiers].sort((a, b) => a.minQty - b.minQty);
}

/**
 * Returns a list of problems; an empty list means the tiers are valid.
 * Rules: at least one tier, the first starts at 1, minQty strictly ascending,
 * prices positive integers and strictly decreasing (each tier must be cheaper).
 */
export function validateTiers(tiers: readonly Tier[]): string[] {
  const errors: string[] = [];
  if (tiers.length === 0) return ["At least one price tier is required."];
  const sorted = sortTiers(tiers);
  if (sorted[0].minQty !== 1) errors.push("The first tier must start at quantity 1.");
  sorted.forEach((tier, i) => {
    if (!Number.isSafeInteger(tier.minQty) || tier.minQty < 1) {
      errors.push(`Tier ${i + 1}: minimum quantity must be a whole number of at least 1.`);
    }
    if (!Number.isSafeInteger(tier.vendorPricePaise) || tier.vendorPricePaise <= 0) {
      errors.push(`Tier ${i + 1}: price must be a positive amount.`);
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (tier.minQty === prev.minQty) {
        errors.push(`Two tiers start at quantity ${tier.minQty}.`);
      } else if (tier.vendorPricePaise >= prev.vendorPricePaise) {
        errors.push(`Tier starting at ${tier.minQty} must be cheaper than the tier before it.`);
      }
    }
  });
  return errors;
}

function checkedSorted(tiers: readonly Tier[]): Tier[] {
  const sorted = sortTiers(tiers);
  if (sorted.length === 0 || sorted[0].minQty !== 1) {
    throw new Error("Invalid tiers: the first tier must start at quantity 1");
  }
  return sorted;
}

/** Index of the tier that applies at a basis count. Counts below 1 use the first tier. */
export function tierIndexAt(tiers: readonly Tier[], qty: number): number {
  assertSafeInt(qty, "qty");
  const sorted = checkedSorted(tiers);
  let index = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (qty >= sorted[i].minQty) index = i;
  }
  return index;
}

export function tierAt(tiers: readonly Tier[], qty: number): Tier {
  return sortTiers(tiers)[tierIndexAt(tiers, qty)];
}

/** The next cheaper tier and how many more (units or flats) unlock it, or null at the best tier. */
export function nextTierAfter(
  tiers: readonly Tier[],
  qty: number,
): { tier: Tier; needed: number } | null {
  const sorted = sortTiers(tiers);
  const index = tierIndexAt(sorted, qty);
  const next = sorted[index + 1];
  if (!next) return null;
  return { tier: next, needed: next.minQty - Math.max(qty, 0) };
}

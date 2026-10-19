// What a tier minimum counts. Groceries reach tiers on units bought; services reach tiers on the
// number of distinct flats booked, so family members (and several ACs in one flat) count once.

export type TierBasis = "UNITS" | "FLATS";

export type BasisItem = { flatId: string; quantity: number };

/** The group's count in its basis: total units, or flats holding at least one unit. */
export function groupBasis(items: readonly BasisItem[], basis: TierBasis): number {
  if (basis === "UNITS") return items.reduce((n, item) => n + Math.max(item.quantity, 0), 0);
  const flats = new Set<string>();
  for (const item of items) if (item.quantity > 0) flats.add(item.flatId);
  return flats.size;
}

/** Tier group key for a grocery product (its own group) or a Service Day (all options together). */
export function productGroupKey(productId: string): string {
  return `product:${productId}`;
}

export function serviceGroupKey(serviceId: string): string {
  return `service:${serviceId}`;
}

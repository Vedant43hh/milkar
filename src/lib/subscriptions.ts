// Standing weekly grocery orders ("keep my order every week"). Pure.

export type StandingItem = { productId: string; quantity: number };

/** A resident's order in one week, as products and quantities (family members' units are separate). */
export function itemsFromOrder(rows: readonly { productId: string | null; quantity: number }[]): StandingItem[] {
  const by = new Map<string, number>();
  for (const r of rows) if (r.productId && r.quantity > 0) by.set(r.productId, (by.get(r.productId) ?? 0) + r.quantity);
  return [...by.entries()].map(([productId, quantity]) => ({ productId, quantity })).sort((a, b) => a.productId.localeCompare(b.productId));
}

/** Reads stored items, dropping anything malformed. */
export function readStandingItems(json: unknown): StandingItem[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((i) => (i && typeof i.productId === "string" && Number.isSafeInteger(i.quantity) && i.quantity > 0 ? [{ productId: i.productId, quantity: i.quantity }] : []));
}

/**
 * What to put in next week's cart: each standing item on the offering for the same product,
 * capped at that week's per-flat limit. Products no longer in the round are skipped.
 */
export function standingTargets(items: readonly StandingItem[], offerings: readonly { id: string; productId: string | null; maxQtyPerFlat: number }[]): Record<string, number> {
  const targets: Record<string, number> = {};
  for (const item of items) {
    const offering = offerings.find((o) => o.productId === item.productId);
    if (offering) targets[offering.id] = Math.min(item.quantity, offering.maxQtyPerFlat);
  }
  return targets;
}

export type StandingStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
export type StandingChange = "PAUSE" | "RESUME" | "CANCEL";

/** The status after a change, or null if it isn't allowed (a cancelled subscription stays cancelled). */
export function nextStanding(status: StandingStatus, change: StandingChange): StandingStatus | null {
  if (status === "CANCELLED") return null;
  if (change === "CANCEL") return "CANCELLED";
  if (change === "PAUSE") return status === "ACTIVE" ? "PAUSED" : null;
  return status === "PAUSED" ? "ACTIVE" : null;
}

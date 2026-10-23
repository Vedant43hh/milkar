// The four kinds of group buy residents see: groceries, home services, repairs and subscriptions.
// Pure: maps a round (and its service's category) to the group it is shown under.

export type BuyCategory = "GROCERIES" | "HOME_SERVICES" | "REPAIRS" | "SUBSCRIPTIONS";
export const BUY_CATEGORIES: readonly BuyCategory[] = ["GROCERIES", "HOME_SERVICES", "REPAIRS", "SUBSCRIPTIONS"];

/** Service categories that are fixing something rather than regular upkeep. */
const REPAIR_SERVICES = new Set(["APPLIANCE_REPAIR", "PLUMBER", "ELECTRICIAN", "CARPENTER", "PAINTER"]);

/** Repair visits: the resident says what's wrong, and the technician may need parts. */
export function isRepairService(category: string | null | undefined): boolean {
  return !!category && REPAIR_SERVICES.has(category);
}

/**
 * Where a round is listed. Anything repeating every week is a subscription (car wash, milk);
 * otherwise groceries, repairs or home services by what it is.
 */
export function buyCategoryOf(round: { kind: "GROCERY" | "SERVICE"; repeatWeekly: boolean; serviceCategory?: string | null }): BuyCategory {
  if (round.repeatWeekly) return "SUBSCRIPTIONS";
  if (round.kind === "GROCERY") return "GROCERIES";
  return round.serviceCategory && REPAIR_SERVICES.has(round.serviceCategory) ? "REPAIRS" : "HOME_SERVICES";
}

/** URL-friendly names for /app/buys/<category>. */
export const CATEGORY_SLUG: Record<BuyCategory, string> = {
  GROCERIES: "groceries",
  HOME_SERVICES: "home-services",
  REPAIRS: "repairs",
  SUBSCRIPTIONS: "subscriptions",
};

export function categoryFromSlug(slug: string): BuyCategory | null {
  return BUY_CATEGORIES.find((c) => CATEGORY_SLUG[c] === slug) ?? null;
}

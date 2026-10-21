import { describe, expect, it } from "vitest";
import { BUY_CATEGORIES, buyCategoryOf, CATEGORY_SLUG, categoryFromSlug } from "./categories";

describe("buy categories", () => {
  it("lists weekly rounds as subscriptions, whatever they sell", () => {
    expect(buyCategoryOf({ kind: "SERVICE", repeatWeekly: true, serviceCategory: "CAR_WASH" })).toBe("SUBSCRIPTIONS");
    expect(buyCategoryOf({ kind: "GROCERY", repeatWeekly: true })).toBe("SUBSCRIPTIONS");
  });

  it("splits one-off Service Days into repairs and home services", () => {
    expect(buyCategoryOf({ kind: "GROCERY", repeatWeekly: false })).toBe("GROCERIES");
    expect(buyCategoryOf({ kind: "SERVICE", repeatWeekly: false, serviceCategory: "AC" })).toBe("HOME_SERVICES");
    expect(buyCategoryOf({ kind: "SERVICE", repeatWeekly: false, serviceCategory: "PEST_CONTROL" })).toBe("HOME_SERVICES");
    for (const repair of ["APPLIANCE_REPAIR", "PLUMBER", "ELECTRICIAN", "CARPENTER", "PAINTER"]) {
      expect(buyCategoryOf({ kind: "SERVICE", repeatWeekly: false, serviceCategory: repair })).toBe("REPAIRS");
    }
  });

  it("round-trips every category through its URL slug", () => {
    for (const c of BUY_CATEGORIES) expect(categoryFromSlug(CATEGORY_SLUG[c])).toBe(c);
    expect(categoryFromSlug("nope")).toBeNull();
  });
});

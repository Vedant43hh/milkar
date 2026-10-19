import { describe, expect, it } from "vitest";
import { groupBasis, productGroupKey, serviceGroupKey } from "./basis";

describe("groupBasis", () => {
  const items = [
    { flatId: "A-101", quantity: 2 }, // two ACs in one flat
    { flatId: "A-101", quantity: 1 }, // a family member in the same flat
    { flatId: "B-402", quantity: 1 },
    { flatId: "C-301", quantity: 0 }, // cancelled: counts for neither basis
  ];

  it("counts units for groceries", () => {
    expect(groupBasis(items, "UNITS")).toBe(4);
  });

  it("counts distinct flats with at least one unit for services", () => {
    expect(groupBasis(items, "FLATS")).toBe(2);
  });

  it("is zero for an empty group", () => {
    expect(groupBasis([], "UNITS")).toBe(0);
    expect(groupBasis([], "FLATS")).toBe(0);
  });
});

describe("tier group keys", () => {
  it("name a product's own group and a Service Day's shared group", () => {
    expect(productGroupKey("p1")).toBe("product:p1");
    expect(serviceGroupKey("s1")).toBe("service:s1");
  });
});

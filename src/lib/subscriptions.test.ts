import { describe, expect, it } from "vitest";
import { itemsFromOrder, nextStanding, readStandingItems, standingTargets } from "./subscriptions";

describe("standing orders", () => {
  it("turns a week's order into products and quantities", () => {
    expect(
      itemsFromOrder([
        { productId: "milk", quantity: 4 },
        { productId: "eggs", quantity: 1 },
        { productId: "milk", quantity: 2 },
        { productId: "bread", quantity: 0 },
        { productId: null, quantity: 3 },
      ]),
    ).toEqual([
      { productId: "eggs", quantity: 1 },
      { productId: "milk", quantity: 6 },
    ]);
    expect(readStandingItems([{ productId: "milk", quantity: 2 }, { productId: 5, quantity: 1 }, { productId: "x", quantity: -1 }, null])).toEqual([{ productId: "milk", quantity: 2 }]);
    expect(readStandingItems("nope")).toEqual([]);
  });

  it("fills next week's cart within its limits, skipping products no longer offered", () => {
    const offerings = [
      { id: "o-milk", productId: "milk", maxQtyPerFlat: 5 },
      { id: "o-eggs", productId: "eggs", maxQtyPerFlat: 4 },
    ];
    expect(standingTargets([{ productId: "milk", quantity: 6 }, { productId: "eggs", quantity: 1 }, { productId: "bread", quantity: 2 }], offerings)).toEqual({ "o-milk": 5, "o-eggs": 1 });
  });

  it("pauses, resumes and cancels, and a cancelled one stays cancelled", () => {
    expect(nextStanding("ACTIVE", "PAUSE")).toBe("PAUSED");
    expect(nextStanding("PAUSED", "RESUME")).toBe("ACTIVE");
    expect(nextStanding("ACTIVE", "RESUME")).toBeNull();
    expect(nextStanding("PAUSED", "CANCEL")).toBe("CANCELLED");
    expect(nextStanding("CANCELLED", "RESUME")).toBeNull();
  });
});

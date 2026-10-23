import { describe, expect, it } from "vitest";
import { checkParts, partsActions, readParts, repairBill } from "./parts";

const tap = { name: "Pillar tap", qty: 1, unitPaise: 45000 };
const tape = { name: "Teflon tape", qty: 2, unitPaise: 2500 };

describe("checkParts", () => {
  it("accepts named parts with a quantity and a price, and totals them", () => {
    expect(checkParts([tap, tape])).toEqual({ ok: true, items: [tap, tape], totalPaise: 50000 });
  });

  it("trims names and skips blank rows from the form", () => {
    const result = checkParts([{ name: "  Pillar tap ", qty: 1, unitPaise: 45000 }, { name: "", qty: "", unitPaise: "" }]);
    expect(result).toEqual({ ok: true, items: [tap], totalPaise: 45000 });
  });

  it.each([
    [[], "NO_ITEMS"],
    [[{ name: "", qty: 0, unitPaise: 0 }], "NO_ITEMS"],
    [Array.from({ length: 11 }, () => tap), "TOO_MANY_ITEMS"],
    [[{ ...tap, name: "X" }], "INVALID_ITEM"],
    [[{ ...tap, qty: 0 }], "INVALID_ITEM"],
    [[{ ...tap, qty: 1.5 }], "INVALID_ITEM"],
    [[{ ...tap, qty: 21 }], "INVALID_ITEM"],
    [[{ ...tap, unitPaise: 99 }], "INVALID_ITEM"], // under ₹1
    [[{ ...tap, unitPaise: 50_000_01 }], "INVALID_ITEM"],
    [[{ ...tap, unitPaise: 45000.5 }], "INVALID_ITEM"],
    [[{ ...tap, qty: 20, unitPaise: 50_000_00 }, { ...tap, qty: 1, unitPaise: 100 }], "TOO_EXPENSIVE"],
  ] as const)("rejects %j", (items, error) => {
    expect(checkParts(items as never)).toEqual({ ok: false, error });
  });
});

describe("readParts", () => {
  it("reads stored parts and drops anything malformed", () => {
    expect(readParts([tap, { name: 3 }, null, { name: "Hinge", qty: 2, unitPaise: 9000 }])).toEqual([tap, { name: "Hinge", qty: 2, unitPaise: 9000 }]);
    expect(readParts("nope")).toEqual([]);
  });
});

describe("repairBill", () => {
  it("adds the parts paid for to the group-priced visit charge", () => {
    const bill = repairBill(29900, [
      { status: "APPROVED", items: [tap] },
      { status: "DECLINED", items: [{ name: "Mixer", qty: 1, unitPaise: 250000 }] },
      { status: "REFUNDED", items: [tape] },
      { status: "PENDING", items: [{ name: "Washer", qty: 3, unitPaise: 1000 }] },
    ]);
    expect(bill).toEqual({ visitPaise: 29900, parts: [tap], partsPaise: 45000, pendingPaise: 3000, totalPaise: 74900 });
  });

  it("is just the visit charge with no parts", () => {
    expect(repairBill(29900, [])).toEqual({ visitPaise: 29900, parts: [], partsPaise: 0, pendingPaise: 0, totalPaise: 29900 });
  });
});

describe("partsActions", () => {
  it("lets the technician ask for parts or finish only while working, and not while waiting", () => {
    expect(partsActions("IN_PROGRESS", [])).toEqual({ canRequest: true, canComplete: true, waiting: false });
    expect(partsActions("IN_PROGRESS", [{ status: "APPROVED" }, { status: "PENDING" }])).toEqual({ canRequest: false, canComplete: false, waiting: true });
    expect(partsActions("IN_PROGRESS", [{ status: "DECLINED" }])).toMatchObject({ canRequest: true, canComplete: true });
    expect(partsActions("ON_THE_WAY", [])).toMatchObject({ canRequest: false, canComplete: false });
  });
});

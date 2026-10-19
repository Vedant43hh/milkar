import { describe, expect, it } from "vitest";
import { computeMeter } from "./meter";
import { P440, P465, P500, RICE } from "./test-fixtures";

describe("computeMeter", () => {
  it("shows how many more units unlock the next tier", () => {
    const m = computeMeter(RICE, 12);
    expect(m.currentUnitPaise).toBe(P500);
    expect(m.next).toEqual({ minQty: 20, unitPaise: P465, needed: 8, savingPerUnitPaise: 3500 });
    expect(m.progressPct).toBe(60);
  });

  it("flags offerings below the vendor minimum", () => {
    const empty = computeMeter(RICE, 0);
    expect(empty.qualifies).toBe(false);
    expect(empty.toQualify).toBe(10);
    expect(empty.progressPct).toBe(0);
    expect(computeMeter(RICE, 9).toQualify).toBe(1);
    expect(computeMeter(RICE, 10).qualifies).toBe(true);
  });

  it("measures progress from the current tier's start", () => {
    expect(computeMeter(RICE, 20).progressPct).toBe(0);
    expect(computeMeter(RICE, 35).progressPct).toBe(50);
    expect(computeMeter(RICE, 49).next?.needed).toBe(1);
  });

  it("has no next tier at the best price", () => {
    const m = computeMeter(RICE, 57);
    expect(m.currentUnitPaise).toBe(P440);
    expect(m.next).toBeNull();
    expect(m.progressPct).toBe(100);
  });

  it("reports saving versus MRP and the price ladder", () => {
    const m = computeMeter(RICE, 25);
    expect(m.savingVsMrpPaise).toBe(55000 - P465);
    expect(m.ladder).toEqual([
      { minQty: 1, unitPaise: P500, reached: true },
      { minQty: 20, unitPaise: P465, reached: true },
      { minQty: 50, unitPaise: P440, reached: false },
    ]);
    expect(computeMeter({ ...RICE, mrpPaise: 40000 }, 1).savingVsMrpPaise).toBe(0);
  });
});

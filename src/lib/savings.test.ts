import { describe, expect, it } from "vitest";
import { savingsVsMrp } from "./savings";

describe("savingsVsMrp", () => {
  it("adds up MRP minus what was finally paid", () => {
    expect(savingsVsMrp([{ mrpPaise: 55000, quantity: 2, finalPaise: 88000 }, { mrpPaise: 9600, quantity: 3, finalPaise: 25200 }])).toBe(22000 + 3600);
  });

  it("never counts an item that cost more than MRP as negative savings", () => {
    expect(savingsVsMrp([{ mrpPaise: 10000, quantity: 1, finalPaise: 12000 }, { mrpPaise: 5000, quantity: 1, finalPaise: 4000 }])).toBe(1000);
    expect(savingsVsMrp([])).toBe(0);
  });
});

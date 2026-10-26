import { describe, expect, it } from "vitest";
import { canManageTeam, checkDeliveryIssue, checkRevisitTime, distributionProgress, pickupCodeMatches } from "./manager-rules";

describe("canManageTeam", () => {
  it("is for the primary Society Manager only", () => {
    expect(canManageTeam("PRIMARY")).toBe(true);
    expect(canManageTeam("ASSISTANT")).toBe(false);
    expect(canManageTeam(null)).toBe(false);
  });
});

describe("distribution", () => {
  it("counts collected flats and is done when every flat has collected", () => {
    expect(distributionProgress([{ status: "COLLECTED" }, { status: "PENDING" }])).toEqual({ collected: 1, total: 2, done: false });
    expect(distributionProgress([{ status: "COLLECTED" }, { status: "COLLECTED" }])).toEqual({ collected: 2, total: 2, done: true });
    expect(distributionProgress([])).toEqual({ collected: 0, total: 0, done: false });
  });

  it("matches a pickup code typed with spaces, and nothing else", () => {
    expect(pickupCodeMatches("4821", "48 21")).toBe(true);
    expect(pickupCodeMatches("4821", " 4821 ")).toBe(true);
    expect(pickupCodeMatches("4821", "4812")).toBe(false);
    expect(pickupCodeMatches("4821", "")).toBe(false);
  });

  it("lets short and damaged counts only grow, within what was bought", () => {
    const base = { quantity: 4, prevShort: 1, prevDamaged: 0 };
    expect(checkDeliveryIssue({ ...base, short: 1, damaged: 1 })).toBeNull();
    expect(checkDeliveryIssue({ ...base, short: 1, damaged: 0 })).toBeNull(); // the same again: nothing new
    expect(checkDeliveryIssue({ ...base, short: 0, damaged: 2 })).toBe("CANNOT_DECREASE");
    expect(checkDeliveryIssue({ ...base, short: 3, damaged: 2 })).toBe("TOO_MANY");
    expect(checkDeliveryIssue({ ...base, short: 1.5, damaged: 0 })).toBe("INVALID_QUANTITY");
    expect(checkDeliveryIssue({ ...base, short: -1, damaged: 0 })).toBe("INVALID_QUANTITY");
  });
});

describe("checkRevisitTime", () => {
  const now = new Date("2026-10-23T06:00:00Z");
  const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

  it("needs an hour's notice and falls within two weeks", () => {
    expect(checkRevisitTime(hours(2), now)).toBeNull();
    expect(checkRevisitTime(hours(14 * 24), now)).toBeNull();
    expect(checkRevisitTime(hours(0.5), now)).toBe("TOO_SOON");
    expect(checkRevisitTime(hours(-3), now)).toBe("TOO_SOON");
    expect(checkRevisitTime(hours(14 * 24 + 1), now)).toBe("TOO_FAR");
    expect(checkRevisitTime(new Date("nope"), now)).toBe("TOO_SOON");
  });
});

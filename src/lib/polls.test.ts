import { describe, expect, it } from "vitest";
import { canVote, crossesThreshold, defaultRoundDates, pollProgress, shouldNotifyThreshold } from "./polls";

describe("poll threshold", () => {
  it("is crossed exactly by the vote that reaches it", () => {
    expect(crossesThreshold(18, 19, 20)).toBe(false);
    expect(crossesThreshold(19, 20, 20)).toBe(true);
    expect(crossesThreshold(20, 21, 20)).toBe(false);
  });

  it("notifies the manager once: never again after thresholdNotifiedAt is set", () => {
    const poll = { threshold: 20, thresholdNotifiedAt: null };
    expect(shouldNotifyThreshold(poll, 19)).toBe(false);
    expect(shouldNotifyThreshold(poll, 20)).toBe(true);
    expect(shouldNotifyThreshold(poll, 23)).toBe(true); // e.g. votes imported in bulk
    expect(shouldNotifyThreshold({ ...poll, thresholdNotifiedAt: new Date() }, 21)).toBe(false);
  });

  it("reports progress, capped at 100%", () => {
    expect(pollProgress(12, 20)).toEqual({ pct: 60, remaining: 8, reached: false });
    expect(pollProgress(23, 20)).toEqual({ pct: 100, remaining: 0, reached: true });
  });
});

describe("polls", () => {
  const now = new Date("2026-10-19T06:00:00Z"); // Mon 11:30 AM IST

  it("pre-fill a round: cutoff in 3 days at 8 PM IST, service in 5 days at 9 AM IST", () => {
    expect(defaultRoundDates(now)).toEqual({
      cutoffAt: new Date("2026-10-22T14:30:00Z"),
      deliveryAt: new Date("2026-10-24T03:30:00Z"),
    });
  });

  it("accept votes only while open", () => {
    expect(canVote({ status: "OPEN", closesAt: null }, now)).toBe(true);
    expect(canVote({ status: "OPEN", closesAt: now }, now)).toBe(false);
    expect(canVote({ status: "SUGGESTED", closesAt: null }, now)).toBe(false);
    expect(canVote({ status: "CONVERTED", closesAt: null }, now)).toBe(false);
  });
});

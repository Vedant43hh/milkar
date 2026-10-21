import { describe, expect, it } from "vitest";
import { EXAMPLE_BASKET, simulate } from "./simulator";

describe("the landing page's price-drop simulator", () => {
  it("starts at the one-flat price with nothing saved on trips", () => {
    expect(simulate(EXAMPLE_BASKET, 1)).toEqual({
      flats: 1,
      pricePaise: 285_000,
      savedPerFlatPaise: 15_000,
      communitySavedPaise: 15_000,
      tierIndex: 0,
      next: { minFlats: 10, needed: 9, pricePaise: 264_000 },
      progress: 0,
      separateTrips: 1,
      groupTrips: 1,
      tripsSaved: 0,
    });
  });

  it("drops the price for everyone exactly at each tier", () => {
    expect(simulate(EXAMPLE_BASKET, 9).pricePaise).toBe(285_000);
    expect(simulate(EXAMPLE_BASKET, 10).pricePaise).toBe(264_000);
    expect(simulate(EXAMPLE_BASKET, 24).pricePaise).toBe(264_000);
    expect(simulate(EXAMPLE_BASKET, 25).pricePaise).toBe(252_000);
    expect(simulate(EXAMPLE_BASKET, 50).pricePaise).toBe(240_000);
  });

  it("adds up the whole building's savings and the trips it saves", () => {
    const thirty = simulate(EXAMPLE_BASKET, 30);
    expect(thirty.savedPerFlatPaise).toBe(48_000); // ₹3,000 − ₹2,520
    expect(thirty.communitySavedPaise).toBe(30 * 48_000);
    expect([thirty.separateTrips, thirty.groupTrips, thirty.tripsSaved]).toEqual([30, 1, 29]);
    expect(thirty.next).toEqual({ minFlats: 50, needed: 20, pricePaise: 240_000 });
    expect(thirty.progress).toBe(20); // 5 of the 25 flats between 25 and 50
  });

  it("shows the best price as complete, and keeps the slider in range", () => {
    expect(simulate(EXAMPLE_BASKET, 100)).toMatchObject({ next: null, progress: 100, tierIndex: 3 });
    expect(simulate(EXAMPLE_BASKET, 500).flats).toBe(100);
    expect(simulate(EXAMPLE_BASKET, 0).flats).toBe(1);
    expect(simulate(EXAMPLE_BASKET, Number.NaN).flats).toBe(1);
    expect(simulate(EXAMPLE_BASKET, 12.6).flats).toBe(13);
  });

  it("never lets a later tier cost more, and saves more as flats join", () => {
    let previous = simulate(EXAMPLE_BASKET, 1);
    for (let flats = 2; flats <= 100; flats++) {
      const now = simulate(EXAMPLE_BASKET, flats);
      expect(now.pricePaise).toBeLessThanOrEqual(previous.pricePaise);
      expect(now.communitySavedPaise).toBeGreaterThan(previous.communitySavedPaise);
      previous = now;
    }
  });
});

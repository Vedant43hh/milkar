import { describe, expect, it } from "vitest";
import { communityImpact, countTrips, DEFAULT_IMPACT_ASSUMPTIONS } from "./impact";

describe("countTrips", () => {
  it("turns one delivery per flat and shop into one trip per shop and round", () => {
    const deliveries = [
      { roundId: "r1", flatId: "A-101", vendorId: "balaji" },
      { roundId: "r1", flatId: "A-101", vendorId: "annapurna" },
      { roundId: "r1", flatId: "A-102", vendorId: "balaji" },
      { roundId: "r1", flatId: "B-201", vendorId: "balaji" },
      { roundId: "r1", flatId: "B-201", vendorId: "balaji" }, // two items from the same shop: still one delivery
    ];
    expect(countTrips(deliveries, [])).toEqual({ separate: 4, together: 2, avoided: 2 });
  });

  it("counts every visit as a trip on its own, and one trip per Service Day date together", () => {
    const visits = [
      { roundId: "clean", day: "2026-10-11" },
      { roundId: "clean", day: "2026-10-11" },
      { roundId: "clean", day: "2026-10-12" },
      { roundId: "clean", day: "2026-10-14" }, // a revisit on another day is its own trip either way
    ];
    expect(countTrips([], visits)).toEqual({ separate: 4, together: 3, avoided: 1 });
  });

  it("adds groceries and services together, and never goes below zero", () => {
    expect(countTrips([{ roundId: "r", flatId: "f", vendorId: "v" }], [{ roundId: "s", day: "d" }])).toEqual({ separate: 2, together: 2, avoided: 0 });
    expect(countTrips([], [])).toEqual({ separate: 0, together: 0, avoided: 0 });
  });
});

describe("communityImpact", () => {
  it("estimates distance, fuel and CO₂ from the trips avoided", () => {
    const impact = communityImpact({ savedPaise: 1_234_500, trips: { separate: 120, together: 10, avoided: 110 } });
    // 110 trips × 8 km = 880 km; × 0.04 L = 35.2 L; × 2.3 kg = 80.96 kg
    expect(impact).toEqual({ savedPaise: 1_234_500, trips: { separate: 120, together: 10, avoided: 110 }, km: 880, litres: 35.2, kgCo2: 81, assumptions: DEFAULT_IMPACT_ASSUMPTIONS });
  });

  it("uses the assumptions it is given", () => {
    const impact = communityImpact({ savedPaise: 0, trips: { separate: 5, together: 1, avoided: 4 } }, { kmPerTrip: 10, litresPerKm: 0.1, kgCo2PerLitre: 2.5 });
    expect(impact).toMatchObject({ km: 40, litres: 4, kgCo2: 10 });
  });

  it("is all zeros for a community that hasn't bought anything yet", () => {
    expect(communityImpact({ savedPaise: 0, trips: countTrips([], []) })).toMatchObject({ savedPaise: 0, km: 0, litres: 0, kgCo2: 0 });
  });
});

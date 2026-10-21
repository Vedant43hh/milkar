// The landing page's price-drop simulator: what happens to one group buy as more flats join. Pure,
// and run on example numbers that the page labels as an example.

export type SimTier = { minFlats: number; pricePaise: number };
export type SimExample = { mrpPaise: number; tiers: readonly SimTier[] };

/** A family's monthly grocery basket: ₹3,000 at the corner shop, cheaper as the building orders together. */
export const EXAMPLE_BASKET: SimExample = {
  mrpPaise: 300_000,
  tiers: [
    { minFlats: 1, pricePaise: 285_000 },
    { minFlats: 10, pricePaise: 264_000 },
    { minFlats: 25, pricePaise: 252_000 },
    { minFlats: 50, pricePaise: 240_000 },
  ],
};

export const SIM_MIN_FLATS = 1;
export const SIM_MAX_FLATS = 100;

export type SimResult = {
  flats: number;
  pricePaise: number;
  savedPerFlatPaise: number;
  communitySavedPaise: number;
  tierIndex: number;
  /** The next tier and how many more flats it needs; null at the best price. */
  next: { minFlats: number; needed: number; pricePaise: number } | null;
  /** 0–100: how far the building is from the current tier to the next. */
  progress: number;
  /** One delivery or visit per flat if everyone ordered alone; one for the whole group. */
  separateTrips: number;
  groupTrips: number;
  tripsSaved: number;
};

export function simulate(example: SimExample, flatsInput: number): SimResult {
  const flats = Math.min(SIM_MAX_FLATS, Math.max(SIM_MIN_FLATS, Math.round(flatsInput) || SIM_MIN_FLATS));
  const tiers = [...example.tiers].sort((a, b) => a.minFlats - b.minFlats);
  let tierIndex = 0;
  tiers.forEach((tier, i) => {
    if (flats >= tier.minFlats) tierIndex = i;
  });
  const tier = tiers[tierIndex];
  const following = tiers[tierIndex + 1];
  const savedPerFlatPaise = example.mrpPaise - tier.pricePaise;
  return {
    flats,
    pricePaise: tier.pricePaise,
    savedPerFlatPaise,
    communitySavedPaise: savedPerFlatPaise * flats,
    tierIndex,
    next: following ? { minFlats: following.minFlats, needed: following.minFlats - flats, pricePaise: following.pricePaise } : null,
    progress: following ? Math.round(((flats - tier.minFlats) / (following.minFlats - tier.minFlats)) * 100) : 100,
    separateTrips: flats,
    groupTrips: 1,
    tripsSaved: flats - 1,
  };
}

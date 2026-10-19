import type { TierBasis } from "./basis";
import { unitPrice, type OfferingPricing } from "./price";
import { nextTierAfter, sortTiers, tierIndexAt } from "./tiers";

export type MeterInput = OfferingPricing & {
  tierBasis: TierBasis;
  minOrderQty: number;
  mrpPaise: number;
};

export type Meter = {
  /** What `count` measures: units bought or distinct flats booked. Labels come from the UI. */
  basis: TierBasis;
  /** The tier group's count right now. */
  count: number;
  /** Resident price per unit (incl. margin and GST) at the current count. */
  currentUnitPaise: number;
  /** True once the vendor's group minimum is met. */
  qualifies: boolean;
  toQualify: number;
  next: {
    minQty: number;
    unitPaise: number;
    needed: number;
    savingPerUnitPaise: number;
  } | null;
  /** 0–100 progress from the current tier's start to the next tier (100 at the best tier). */
  progressPct: number;
  /** Per-unit saving versus MRP at the current price (can be 0, never negative). */
  savingVsMrpPaise: number;
  /** Every tier with its resident price, for the price ladder. */
  ladder: { minQty: number; unitPaise: number; reached: boolean }[];
};

export function computeMeter(input: MeterInput, basisCount: number): Meter {
  const count = Math.max(basisCount, 0);
  const tiers = sortTiers(input.tiers);
  const index = tierIndexAt(tiers, count);
  const priceOf = (vendorPaise: number) => unitPrice(vendorPaise, input.marginBps, input.gstBps).totalPaise;
  const currentUnitPaise = priceOf(tiers[index].vendorPricePaise);

  const upcoming = nextTierAfter(tiers, count);
  let next: Meter["next"] = null;
  let progressPct = 100;
  if (upcoming) {
    const unitPaise = priceOf(upcoming.tier.vendorPricePaise);
    next = {
      minQty: upcoming.tier.minQty,
      unitPaise,
      needed: upcoming.needed,
      savingPerUnitPaise: currentUnitPaise - unitPaise,
    };
    const from = index === 0 ? 0 : tiers[index].minQty;
    const span = upcoming.tier.minQty - from;
    progressPct = Math.floor(((count - from) * 100) / span);
  }

  return {
    basis: input.tierBasis,
    count,
    currentUnitPaise,
    qualifies: count >= input.minOrderQty,
    toQualify: Math.max(input.minOrderQty - count, 0),
    next,
    progressPct,
    savingVsMrpPaise: Math.max(input.mrpPaise - currentUnitPaise, 0),
    ladder: tiers.map((t) => ({
      minQty: t.minQty,
      unitPaise: priceOf(t.vendorPricePaise),
      reached: count >= t.minQty && count > 0,
    })),
  };
}

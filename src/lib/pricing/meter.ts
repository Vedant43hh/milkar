import { unitPrice, type ProductPricing } from "./price";
import { nextTierAfter, sortTiers, tierIndexAt } from "./tiers";

export type MeterInput = ProductPricing & {
  minOrderQty: number;
  mrpPaise: number;
};

export type Meter = {
  totalQty: number;
  /** Resident price per unit (incl. margin and GST) at the current society-wide quantity. */
  currentUnitPaise: number;
  /** True once the supplier's society-wide minimum is met. */
  qualifies: boolean;
  unitsToQualify: number;
  next: {
    minQty: number;
    unitPaise: number;
    unitsNeeded: number;
    savingPerUnitPaise: number;
  } | null;
  /** 0–100 progress from the current tier's start to the next tier (100 at the best tier). */
  progressPct: number;
  /** Per-unit saving versus MRP at the current price (can be 0, never negative). */
  savingVsMrpPaise: number;
  /** Every tier with its resident price, for the price ladder. */
  ladder: { minQty: number; unitPaise: number; reached: boolean }[];
};

export function computeMeter(input: MeterInput, totalQty: number): Meter {
  const qty = Math.max(totalQty, 0);
  const tiers = sortTiers(input.tiers);
  const index = tierIndexAt(tiers, qty);
  const priceOf = (supplierPaise: number) =>
    unitPrice(supplierPaise, input.marginBps, input.gstBps).totalPaise;
  const currentUnitPaise = priceOf(tiers[index].supplierPricePaise);

  const upcoming = nextTierAfter(tiers, qty);
  let next: Meter["next"] = null;
  let progressPct = 100;
  if (upcoming) {
    const unitPaise = priceOf(upcoming.tier.supplierPricePaise);
    next = {
      minQty: upcoming.tier.minQty,
      unitPaise,
      unitsNeeded: upcoming.unitsNeeded,
      savingPerUnitPaise: currentUnitPaise - unitPaise,
    };
    const from = index === 0 ? 0 : tiers[index].minQty;
    const span = upcoming.tier.minQty - from;
    progressPct = Math.floor(((qty - from) * 100) / span);
  }

  return {
    totalQty: qty,
    currentUnitPaise,
    qualifies: qty >= input.minOrderQty,
    unitsToQualify: Math.max(input.minOrderQty - qty, 0),
    next,
    progressPct,
    savingVsMrpPaise: Math.max(input.mrpPaise - currentUnitPaise, 0),
    ladder: tiers.map((t) => ({
      minQty: t.minQty,
      unitPaise: priceOf(t.supplierPricePaise),
      reached: qty >= t.minQty && qty > 0,
    })),
  };
}

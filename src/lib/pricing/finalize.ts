import { groupBasis, type TierBasis } from "./basis";
import { lotsQty, lotsTotal, protectedUnitPaise, type Lot } from "./lots";
import { unitPrice, type UnitPrice } from "./price";
import { tierAt, type Tier } from "./tiers";

export type FinalizeItem = {
  orderItemId: string;
  userId: string;
  flatId: string;
  lots: Lot[];
  chargedPaise: number;
};

export type FinalizeOffering = {
  offeringId: string;
  /** Offerings sharing a key reach tiers and the minimum together. */
  tierGroupKey: string;
  tierBasis: TierBasis;
  tiers: Tier[];
  gstBps: number;
  /** Group minimum in the tier basis; every offering in a group carries the same value. */
  minOrderQty: number;
  items: FinalizeItem[];
};

export type FinalizeInput = {
  marginBps: number;
  offerings: FinalizeOffering[];
};

export type FinalizedItem = {
  orderItemId: string;
  userId: string;
  flatId: string;
  quantity: number;
  chargedPaise: number;
  finalPaise: number;
  refundPaise: number;
  /** Cost the platform takes on because this resident paid less than the final price. */
  absorbedPaise: number;
};

export type DropReason = "NO_ORDERS" | "BELOW_MINIMUM";

export type FinalizedOffering = {
  offeringId: string;
  tierGroupKey: string;
  status: "CONFIRMED" | "DROPPED";
  dropReason: DropReason | null;
  /** Units of this offering. */
  totalQty: number;
  /** The whole group's count in its basis (units or flats). */
  basisCount: number;
  tier: Tier | null;
  unit: UnitPrice | null;
  items: FinalizedItem[];
};

export type FinalizedGroup = {
  tierGroupKey: string;
  tierBasis: TierBasis;
  basisCount: number;
  status: "CONFIRMED" | "DROPPED";
  dropReason: DropReason | null;
};

export type FinalizeTotals = {
  residentPaidPaise: number;
  refundsPaise: number;
  absorbedPaise: number;
  vendorCostPaise: number;
  grossMarginPaise: number;
};

export type FinalizeResult = {
  /** In input order. */
  offerings: FinalizedOffering[];
  groups: FinalizedGroup[];
  totals: FinalizeTotals;
};

function liveItems(offering: FinalizeOffering): FinalizeItem[] {
  const live = offering.items.filter((item) => lotsQty(item.lots) > 0);
  for (const item of live) {
    if (lotsTotal(item.lots) !== item.chargedPaise) {
      throw new Error(`Order item ${item.orderItemId}: charged amount does not match its lots`);
    }
  }
  return live;
}

function refundInFull(items: FinalizeItem[]): FinalizedItem[] {
  return items.map((item) => ({
    orderItemId: item.orderItemId,
    userId: item.userId,
    flatId: item.flatId,
    quantity: lotsQty(item.lots),
    chargedPaise: item.chargedPaise,
    finalPaise: 0,
    refundPaise: item.chargedPaise,
    absorbedPaise: 0,
  }));
}

/**
 * Computes the outcome of a round at cutoff. Pure and deterministic.
 *
 * Offerings are grouped by tierGroupKey. A group's count is measured in its basis: units for a
 * grocery product (a group of one), distinct flats for all options of a Service Day. If the group
 * has no orders or is below its minimum, every offering in it is dropped and every item refunded
 * in full. Otherwise each offering's tier at the group count sets its final unit price F, and each
 * lot finally costs min(lot price, F) per unit: better tiers refund the difference, and a worse
 * tier (after cancellations) never charges more than was paid. The platform absorbs that gap.
 */
export function computeFinalization(input: FinalizeInput): FinalizeResult {
  const totals: FinalizeTotals = {
    residentPaidPaise: 0,
    refundsPaise: 0,
    absorbedPaise: 0,
    vendorCostPaise: 0,
    grossMarginPaise: 0,
  };

  const live = new Map(input.offerings.map((o) => [o.offeringId, liveItems(o)]));
  const groups = new Map<string, FinalizedGroup>();
  for (const offering of input.offerings) {
    const existing = groups.get(offering.tierGroupKey);
    if (existing) {
      if (existing.tierBasis !== offering.tierBasis) {
        throw new Error(`Tier group ${offering.tierGroupKey} mixes UNITS and FLATS`);
      }
      continue;
    }
    const members = input.offerings.filter((o) => o.tierGroupKey === offering.tierGroupKey);
    if (members.some((o) => o.minOrderQty !== offering.minOrderQty)) {
      throw new Error(`Tier group ${offering.tierGroupKey} has more than one minimum`);
    }
    const basisCount = groupBasis(
      members.flatMap((o) => live.get(o.offeringId)!.map((i) => ({ flatId: i.flatId, quantity: lotsQty(i.lots) }))),
      offering.tierBasis,
    );
    const dropReason: DropReason | null =
      basisCount === 0 ? "NO_ORDERS" : basisCount < offering.minOrderQty ? "BELOW_MINIMUM" : null;
    groups.set(offering.tierGroupKey, {
      tierGroupKey: offering.tierGroupKey,
      tierBasis: offering.tierBasis,
      basisCount,
      status: dropReason ? "DROPPED" : "CONFIRMED",
      dropReason,
    });
  }

  const offerings = input.offerings.map((offering): FinalizedOffering => {
    const group = groups.get(offering.tierGroupKey)!;
    const items = live.get(offering.offeringId)!;
    const totalQty = items.reduce((n, item) => n + lotsQty(item.lots), 0);
    const base = { offeringId: offering.offeringId, tierGroupKey: offering.tierGroupKey, totalQty, basisCount: group.basisCount };

    // A confirmed group can still contain an option nobody booked; it has nothing to confirm.
    const dropReason = group.dropReason ?? (totalQty === 0 ? "NO_ORDERS" : null);
    if (dropReason) {
      const refunded = refundInFull(items);
      totals.refundsPaise += refunded.reduce((s, i) => s + i.refundPaise, 0);
      return { ...base, status: "DROPPED", dropReason, tier: null, unit: null, items: refunded };
    }

    const tier = tierAt(offering.tiers, group.basisCount);
    const unit = unitPrice(tier.vendorPricePaise, input.marginBps, offering.gstBps);
    const finalized = items.map((item) => {
      let finalPaise = 0;
      let absorbedPaise = 0;
      for (const lot of item.lots) {
        finalPaise += lot.quantity * protectedUnitPaise(lot, unit.totalPaise);
        absorbedPaise += lot.quantity * Math.max(0, unit.totalPaise - lot.unitPricePaise);
      }
      return {
        orderItemId: item.orderItemId,
        userId: item.userId,
        flatId: item.flatId,
        quantity: lotsQty(item.lots),
        chargedPaise: item.chargedPaise,
        finalPaise,
        refundPaise: item.chargedPaise - finalPaise,
        absorbedPaise,
      };
    });

    totals.residentPaidPaise += finalized.reduce((s, i) => s + i.finalPaise, 0);
    totals.refundsPaise += finalized.reduce((s, i) => s + i.refundPaise, 0);
    totals.absorbedPaise += finalized.reduce((s, i) => s + i.absorbedPaise, 0);
    totals.vendorCostPaise += totalQty * unit.vendorPaise;
    totals.grossMarginPaise += totalQty * unit.marginPaise;

    return { ...base, status: "CONFIRMED", dropReason: null, tier, unit, items: finalized };
  });

  return { offerings, groups: [...groups.values()], totals };
}

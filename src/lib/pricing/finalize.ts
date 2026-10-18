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

export type FinalizeProduct = {
  roundProductId: string;
  tiers: Tier[];
  gstBps: number;
  minOrderQty: number;
  items: FinalizeItem[];
};

export type FinalizeInput = {
  marginBps: number;
  products: FinalizeProduct[];
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

export type FinalizedProduct = {
  roundProductId: string;
  status: "CONFIRMED" | "DROPPED";
  dropReason: "NO_ORDERS" | "BELOW_MINIMUM" | null;
  totalQty: number;
  tier: Tier | null;
  unit: UnitPrice | null;
  items: FinalizedItem[];
};

export type FinalizeTotals = {
  residentPaidPaise: number;
  refundsPaise: number;
  absorbedPaise: number;
  supplierCostPaise: number;
  grossMarginPaise: number;
};

export type FinalizeResult = {
  products: FinalizedProduct[];
  totals: FinalizeTotals;
};

/**
 * Computes the outcome of a round at cutoff. Pure and deterministic.
 *
 * Per product: if no units or fewer than the supplier minimum, it is dropped and every item is
 * refunded in full. Otherwise the tier reached sets the final unit price F, and each lot finally
 * costs min(lot price, F) per unit: better tiers refund the difference, and a worse tier (after
 * cancellations) never charges more than was paid. The platform absorbs that gap.
 */
export function computeFinalization(input: FinalizeInput): FinalizeResult {
  const totals: FinalizeTotals = {
    residentPaidPaise: 0,
    refundsPaise: 0,
    absorbedPaise: 0,
    supplierCostPaise: 0,
    grossMarginPaise: 0,
  };

  const products = input.products.map((product): FinalizedProduct => {
    const live = product.items.filter((item) => lotsQty(item.lots) > 0);
    for (const item of live) {
      if (lotsTotal(item.lots) !== item.chargedPaise) {
        throw new Error(`Order item ${item.orderItemId}: charged amount does not match its lots`);
      }
    }
    const totalQty = live.reduce((n, item) => n + lotsQty(item.lots), 0);

    if (totalQty === 0 || totalQty < product.minOrderQty) {
      const items = live.map((item) => ({
        orderItemId: item.orderItemId,
        userId: item.userId,
        flatId: item.flatId,
        quantity: lotsQty(item.lots),
        chargedPaise: item.chargedPaise,
        finalPaise: 0,
        refundPaise: item.chargedPaise,
        absorbedPaise: 0,
      }));
      totals.refundsPaise += items.reduce((s, i) => s + i.refundPaise, 0);
      return {
        roundProductId: product.roundProductId,
        status: "DROPPED",
        dropReason: totalQty === 0 ? "NO_ORDERS" : "BELOW_MINIMUM",
        totalQty,
        tier: null,
        unit: null,
        items,
      };
    }

    const tier = tierAt(product.tiers, totalQty);
    const unit = unitPrice(tier.supplierPricePaise, input.marginBps, product.gstBps);
    const items = live.map((item) => {
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

    totals.residentPaidPaise += items.reduce((s, i) => s + i.finalPaise, 0);
    totals.refundsPaise += items.reduce((s, i) => s + i.refundPaise, 0);
    totals.absorbedPaise += items.reduce((s, i) => s + i.absorbedPaise, 0);
    totals.supplierCostPaise += totalQty * unit.supplierPaise;
    totals.grossMarginPaise += totalQty * unit.marginPaise;

    return {
      roundProductId: product.roundProductId,
      status: "CONFIRMED",
      dropReason: null,
      totalQty,
      tier,
      unit,
      items,
    };
  });

  return { products, totals };
}

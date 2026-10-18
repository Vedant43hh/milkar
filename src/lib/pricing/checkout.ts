import { assertSafeInt } from "./money";
import { lotsQty, removeUnits, type Lot } from "./lots";
import { unitPriceAtQty, type ProductPricing } from "./price";
import { checkChange, type ChangeError, type RoundWindow } from "./rules";

export type IdLot = Lot & { id: string };

export type QuoteProduct = {
  roundProductId: string;
  pricing: ProductPricing;
  active: boolean;
  maxQtyPerFlat: number;
  /** Society-wide paid quantity right now, including this user's current units. */
  societyQty: number;
  /** Paid quantity held by other users in the same flat. */
  flatOthersQty: number;
  userLots: IdLot[];
};

export type QuoteInput = {
  round: RoundWindow;
  now: Date;
  products: QuoteProduct[];
  /** roundProductId → quantity the resident wants to end up with. */
  targets: Record<string, number>;
  walletBalancePaise: number;
};

export type QuoteLine = {
  roundProductId: string;
  baseQty: number;
  /** Identifies the exact lots the quote was computed from, to detect stale quotes. */
  baseLotsKey: string;
  targetQty: number;
  addQty: number;
  addUnitPaise: number;
  addPaise: number;
  removeQty: number;
  removals: { lotId: string; units: number; unitPricePaise: number }[];
  creditPaise: number;
};

export type Quote = {
  lines: QuoteLine[];
  chargePaise: number;
  creditPaise: number;
  walletAppliedPaise: number;
  gatewayPaise: number;
};

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; errors: ChangeError[] };

export function lotsKey(lots: readonly IdLot[]): string {
  return lots
    .map((l) => `${l.id}:${l.quantity}`)
    .sort()
    .join(",");
}

/**
 * Prices a set of quantity changes for one resident.
 *
 * Charging rule: added units are priced at the tier for the society's paid total BEFORE this
 * change (the resident's new units are not counted). If the order unlocks a better tier, the
 * difference is refunded at cutoff like everyone else's. This stops anyone using their own order
 * to lock in a protected low price.
 *
 * Removed units are refunded at what was paid for them, most expensive lots first.
 * Wallet balance (including credit from removals in this same change) is always applied first.
 */
export function quoteChanges(input: QuoteInput): QuoteResult {
  assertSafeInt(input.walletBalancePaise, "walletBalancePaise");
  const byId = new Map(input.products.map((p) => [p.roundProductId, p]));
  const errors: ChangeError[] = [];
  const lines: QuoteLine[] = [];

  for (const [roundProductId, targetQty] of Object.entries(input.targets)) {
    const product = byId.get(roundProductId);
    if (!product) {
      errors.push({ code: "PRODUCT_UNAVAILABLE", roundProductId });
      continue;
    }
    const baseQty = lotsQty(product.userLots);
    const error = checkChange({
      round: input.round,
      now: input.now,
      roundProductId,
      productActive: product.active,
      currentQty: baseQty,
      targetQty,
      flatOthersQty: product.flatOthersQty,
      maxQtyPerFlat: product.maxQtyPerFlat,
    });
    if (error) {
      errors.push(error);
      continue;
    }
    if (targetQty === baseQty) continue;

    const line: QuoteLine = {
      roundProductId,
      baseQty,
      baseLotsKey: lotsKey(product.userLots),
      targetQty,
      addQty: 0,
      addUnitPaise: 0,
      addPaise: 0,
      removeQty: 0,
      removals: [],
      creditPaise: 0,
    };
    if (targetQty > baseQty) {
      line.addQty = targetQty - baseQty;
      line.addUnitPaise = unitPriceAtQty(product.pricing, product.societyQty).totalPaise;
      line.addPaise = line.addQty * line.addUnitPaise;
    } else {
      line.removeQty = baseQty - targetQty;
      const { removed, refundPaise } = removeUnits(product.userLots, line.removeQty);
      line.removals = removed.map((r) => ({
        lotId: r.lot.id,
        units: r.units,
        unitPricePaise: r.lot.unitPricePaise,
      }));
      line.creditPaise = refundPaise;
    }
    lines.push(line);
  }

  if (errors.length > 0) return { ok: false, errors };

  const chargePaise = lines.reduce((s, l) => s + l.addPaise, 0);
  const creditPaise = lines.reduce((s, l) => s + l.creditPaise, 0);
  const walletAppliedPaise = Math.min(chargePaise, input.walletBalancePaise + creditPaise);
  return {
    ok: true,
    quote: {
      lines,
      chargePaise,
      creditPaise,
      walletAppliedPaise,
      gatewayPaise: chargePaise - walletAppliedPaise,
    },
  };
}

/** Applies one quote line to a resident's lots, returning the new lots. */
export function applyQuoteLine<T extends IdLot>(
  lots: readonly T[],
  line: QuoteLine,
  newLot: (quantity: number, unitPricePaise: number) => T,
): T[] {
  if (line.addQty > 0) return [...lots, newLot(line.addQty, line.addUnitPaise)];
  if (line.removeQty > 0) return removeUnits(lots, line.removeQty).remaining;
  return [...lots];
}

import { assertSafeInt } from "./money";
import { lotsQty, removeUnits, type Lot } from "./lots";
import { unitPriceAt, type OfferingPricing } from "./price";
import { checkChange, type ChangeError, type RoundWindow } from "./rules";

export type IdLot = Lot & { id: string };

export type QuoteOffering = {
  offeringId: string;
  pricing: OfferingPricing;
  active: boolean;
  maxQtyPerFlat: number;
  /**
   * The offering's tier-group count right now, in its basis (see basis.ts), including this user's
   * current units: community-wide units for a grocery product, distinct flats booked for a service.
   */
  basisCount: number;
  /** Paid quantity held by other users in the same flat. */
  flatOthersQty: number;
  userLots: IdLot[];
};

export type QuoteInput = {
  round: RoundWindow;
  now: Date;
  offerings: QuoteOffering[];
  /** offeringId → quantity the resident wants to end up with. */
  targets: Record<string, number>;
  walletBalancePaise: number;
};

export type QuoteLine = {
  offeringId: string;
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
 * Charging rule: added units are priced at the tier for the group's basis count BEFORE this
 * change. The resident's new units are not counted, and for services a flat booking for the first
 * time does not count itself. If the order unlocks a better tier, the difference is refunded at
 * cutoff like everyone else's. This stops anyone using their own order to lock in a protected
 * low price.
 *
 * Removed units are refunded at what was paid for them, most expensive lots first.
 * Wallet balance (including credit from removals in this same change) is always applied first.
 */
export function quoteChanges(input: QuoteInput): QuoteResult {
  assertSafeInt(input.walletBalancePaise, "walletBalancePaise");
  const byId = new Map(input.offerings.map((o) => [o.offeringId, o]));
  const errors: ChangeError[] = [];
  const lines: QuoteLine[] = [];

  for (const [offeringId, targetQty] of Object.entries(input.targets)) {
    const offering = byId.get(offeringId);
    if (!offering) {
      errors.push({ code: "OFFERING_UNAVAILABLE", offeringId });
      continue;
    }
    const baseQty = lotsQty(offering.userLots);
    const error = checkChange({
      round: input.round,
      now: input.now,
      offeringId,
      offeringActive: offering.active,
      currentQty: baseQty,
      targetQty,
      flatOthersQty: offering.flatOthersQty,
      maxQtyPerFlat: offering.maxQtyPerFlat,
    });
    if (error) {
      errors.push(error);
      continue;
    }
    if (targetQty === baseQty) continue;

    const line: QuoteLine = {
      offeringId,
      baseQty,
      baseLotsKey: lotsKey(offering.userLots),
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
      line.addUnitPaise = unitPriceAt(offering.pricing, offering.basisCount).totalPaise;
      line.addPaise = line.addQty * line.addUnitPaise;
    } else {
      line.removeQty = baseQty - targetQty;
      const { removed, refundPaise } = removeUnits(offering.userLots, line.removeQty);
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

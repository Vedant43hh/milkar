// When residents may change their orders. Pure: callers pass `now`.

export type RoundWindow = {
  status: string;
  cutoffAt: Date;
  reductionFreezeMinutes: number;
};

export const QUOTE_TTL_MS = 15 * 60 * 1000;

/** Moment after which quantities can no longer be reduced or cancelled. */
export function reductionFreezeAt(round: RoundWindow): Date {
  return new Date(round.cutoffAt.getTime() - round.reductionFreezeMinutes * 60_000);
}

/** Additions are allowed until the cutoff instant (exclusive). */
export function canAdd(round: RoundWindow, now: Date): boolean {
  return round.status === "OPEN" && now.getTime() < round.cutoffAt.getTime();
}

/** Reductions and cancellations are allowed until the freeze instant (exclusive). */
export function canReduce(round: RoundWindow, now: Date): boolean {
  return round.status === "OPEN" && now.getTime() < reductionFreezeAt(round).getTime();
}

export function isQuoteExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export type ChangeErrorCode =
  | "ROUND_CLOSED"
  | "REDUCTION_FROZEN"
  | "FLAT_CAP_EXCEEDED"
  | "INVALID_QUANTITY"
  | "PRODUCT_UNAVAILABLE";

export type ChangeError = {
  code: ChangeErrorCode;
  roundProductId: string;
  /** For FLAT_CAP_EXCEEDED: the most this user can hold given the rest of the flat's quantity. */
  maxAllowed?: number;
};

export type ChangeCheck = {
  round: RoundWindow;
  now: Date;
  roundProductId: string;
  productActive: boolean;
  currentQty: number;
  targetQty: number;
  /** Quantity of the same product held by other users in the same flat. */
  flatOthersQty: number;
  maxQtyPerFlat: number;
};

export function checkChange(c: ChangeCheck): ChangeError | null {
  const id = c.roundProductId;
  if (!Number.isSafeInteger(c.targetQty) || c.targetQty < 0) {
    return { code: "INVALID_QUANTITY", roundProductId: id };
  }
  if (c.targetQty === c.currentQty) return null;
  if (c.targetQty > c.currentQty) {
    if (!canAdd(c.round, c.now)) return { code: "ROUND_CLOSED", roundProductId: id };
    if (!c.productActive) return { code: "PRODUCT_UNAVAILABLE", roundProductId: id };
    if (c.flatOthersQty + c.targetQty > c.maxQtyPerFlat) {
      return {
        code: "FLAT_CAP_EXCEEDED",
        roundProductId: id,
        maxAllowed: Math.max(c.maxQtyPerFlat - c.flatOthersQty, 0),
      };
    }
    return null;
  }
  if (!canAdd(c.round, c.now)) return { code: "ROUND_CLOSED", roundProductId: id };
  if (!canReduce(c.round, c.now)) return { code: "REDUCTION_FROZEN", roundProductId: id };
  return null;
}

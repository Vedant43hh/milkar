import { assertSafeInt } from "./money";

/** Units a resident bought at one price. `seq` orders lots by purchase time (higher = newer). */
export type Lot = {
  quantity: number;
  unitPricePaise: number;
  seq: number;
};

export function lotsQty(lots: readonly Lot[]): number {
  return lots.reduce((n, l) => n + l.quantity, 0);
}

export function lotsTotal(lots: readonly Lot[]): number {
  let total = 0;
  for (const l of lots) {
    assertSafeInt(l.quantity, "lot.quantity");
    assertSafeInt(l.unitPricePaise, "lot.unitPricePaise");
    total += l.quantity * l.unitPricePaise;
  }
  assertSafeInt(total, "lots total");
  return total;
}

/**
 * Removes units starting with the most expensive lots (newest first on ties), so the resident
 * gets back exactly what they paid for the units they give up.
 */
export function removeUnits<T extends Lot>(
  lots: readonly T[],
  units: number,
): { remaining: T[]; removed: { lot: T; units: number }[]; refundPaise: number } {
  assertSafeInt(units, "units");
  if (units < 0) throw new RangeError("units must be >= 0");
  if (units > lotsQty(lots)) throw new RangeError("Cannot remove more units than were bought");

  const order = [...lots].sort((a, b) => b.unitPricePaise - a.unitPricePaise || b.seq - a.seq);
  const take = new Map<T, number>();
  let left = units;
  for (const lot of order) {
    if (left === 0) break;
    const n = Math.min(lot.quantity, left);
    if (n > 0) take.set(lot, n);
    left -= n;
  }

  const removed: { lot: T; units: number }[] = [];
  const remaining: T[] = [];
  let refundPaise = 0;
  for (const lot of lots) {
    const n = take.get(lot) ?? 0;
    if (n > 0) {
      removed.push({ lot, units: n });
      refundPaise += n * lot.unitPricePaise;
    }
    if (lot.quantity - n > 0) remaining.push({ ...lot, quantity: lot.quantity - n });
  }
  return { remaining, removed, refundPaise };
}

/** Per-unit amount a lot finally costs: never more than what was paid (price protection). */
export function protectedUnitPaise(lot: Lot, finalUnitPaise: number): number {
  return Math.min(lot.unitPricePaise, finalUnitPaise);
}

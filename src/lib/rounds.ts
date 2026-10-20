// Rules for opening and running rounds, and the numbers on the captain's dashboard. Pure.
import { groupBasis, type TierBasis } from "./pricing/basis";
import { computeMeter, type Meter, type MeterInput } from "./pricing/meter";

/** A round must stay open for at least an hour. */
export const MIN_OPEN_MS = 60 * 60 * 1000;
export const MAX_SERVICE_DAYS = 3;
export const MAX_PER_FLAT_LIMIT = 50;

export type RoundTimeError =
  | "CUTOFF_TOO_SOON"
  | "DELIVERY_BEFORE_CUTOFF"
  | "SERVICE_BEFORE_CUTOFF"
  | "NO_SERVICE_DAYS"
  | "TOO_MANY_SERVICE_DAYS"
  | "DUPLICATE_SERVICE_DAY";

export function validateGroceryTimes({ cutoffAt, deliveryAt, now }: { cutoffAt: Date; deliveryAt: Date; now: Date }): RoundTimeError[] {
  const errors: RoundTimeError[] = [];
  if (cutoffAt.getTime() - now.getTime() < MIN_OPEN_MS) errors.push("CUTOFF_TOO_SOON");
  if (deliveryAt.getTime() <= cutoffAt.getTime()) errors.push("DELIVERY_BEFORE_CUTOFF");
  return errors;
}

/**
 * `days` are the IST day starts of the Service Day(s); `firstSlotAt` is when the earliest slot
 * begins. Bookings must close before the first technician sets out.
 */
export function validateServiceTimes({
  cutoffAt,
  days,
  firstSlotAt,
  now,
}: {
  cutoffAt: Date;
  days: readonly Date[];
  firstSlotAt: Date | null;
  now: Date;
}): RoundTimeError[] {
  const errors: RoundTimeError[] = [];
  if (cutoffAt.getTime() - now.getTime() < MIN_OPEN_MS) errors.push("CUTOFF_TOO_SOON");
  if (days.length === 0) errors.push("NO_SERVICE_DAYS");
  if (days.length > MAX_SERVICE_DAYS) errors.push("TOO_MANY_SERVICE_DAYS");
  if (new Set(days.map((d) => d.getTime())).size !== days.length) errors.push("DUPLICATE_SERVICE_DAY");
  if (firstSlotAt && firstSlotAt.getTime() <= cutoffAt.getTime()) errors.push("SERVICE_BEFORE_CUTOFF");
  return errors;
}

export type ExtensionError = "ROUND_CLOSED" | "NOT_LATER" | "TOO_LATE";

/**
 * A captain can push the cutoff later while the round is still taking orders. It must stay before
 * delivery (groceries) or the first slot (services). Moving the cutoff also moves the reduction
 * freeze, which is the captain's call.
 */
export function validateExtension({
  round,
  newCutoffAt,
  now,
  mustCloseBefore,
}: {
  round: { status: string; cutoffAt: Date };
  newCutoffAt: Date;
  now: Date;
  /** Delivery time for groceries, first slot for services. */
  mustCloseBefore: Date;
}): ExtensionError | null {
  if (round.status !== "OPEN" || round.cutoffAt.getTime() <= now.getTime()) return "ROUND_CLOSED";
  if (newCutoffAt.getTime() <= round.cutoffAt.getTime()) return "NOT_LATER";
  if (newCutoffAt.getTime() >= mustCloseBefore.getTime()) return "TOO_LATE";
  return null;
}

/** Whether a round still takes orders and can be closed early, extended or cancelled. */
export function isTakingOrders(round: { status: string; cutoffAt: Date }, now: Date): boolean {
  return round.status === "OPEN" && round.cutoffAt.getTime() > now.getTime();
}

// ---------- dashboard ----------

export type StatItem = { flatId: string; quantity: number; chargedPaise: number };

export type StatOffering = {
  id: string;
  tierGroupKey: string;
  pricing: MeterInput;
  items: readonly StatItem[];
};

export type OfferingStat = {
  id: string;
  tierGroupKey: string;
  basis: TierBasis;
  units: number;
  flats: number;
  meter: Meter;
};

export type RoundStats = {
  /** Distinct flats with at least one unit anywhere in the round. */
  flats: number;
  units: number;
  collectedPaise: number;
  offerings: OfferingStat[];
  /** Offerings that have started and have a better tier ahead, fewest needed first. */
  closeToUnlock: OfferingStat[];
  /** Offerings with some orders but not yet at the vendor's minimum. */
  belowMinimum: OfferingStat[];
};

export function roundStats(offerings: readonly StatOffering[]): RoundStats {
  const groupCounts = new Map<string, number>();
  for (const o of offerings) {
    if (groupCounts.has(o.tierGroupKey)) continue;
    const members = offerings.filter((m) => m.tierGroupKey === o.tierGroupKey);
    groupCounts.set(o.tierGroupKey, groupBasis(members.flatMap((m) => m.items), o.pricing.tierBasis));
  }

  const stats = offerings.map((o): OfferingStat => {
    const live = o.items.filter((i) => i.quantity > 0);
    return {
      id: o.id,
      tierGroupKey: o.tierGroupKey,
      basis: o.pricing.tierBasis,
      units: live.reduce((n, i) => n + i.quantity, 0),
      flats: new Set(live.map((i) => i.flatId)).size,
      meter: computeMeter(o.pricing, groupCounts.get(o.tierGroupKey)!),
    };
  });

  const allItems = offerings.flatMap((o) => o.items).filter((i) => i.quantity > 0);
  return {
    flats: new Set(allItems.map((i) => i.flatId)).size,
    units: allItems.reduce((n, i) => n + i.quantity, 0),
    collectedPaise: offerings.flatMap((o) => o.items).reduce((s, i) => s + i.chargedPaise, 0),
    offerings: stats,
    closeToUnlock: stats
      .filter((s) => s.meter.count > 0 && s.meter.qualifies && s.meter.next)
      .sort((a, b) => a.meter.next!.needed - b.meter.next!.needed || b.meter.next!.savingPerUnitPaise - a.meter.next!.savingPerUnitPaise),
    belowMinimum: stats.filter((s) => s.meter.count > 0 && !s.meter.qualifies).sort((a, b) => a.meter.toQualify - b.meter.toQualify),
  };
}

// ---------- presentation ----------

export type DisplayStatus = "OPEN" | "CLOSED" | "FINALIZING" | "FINALIZED" | "COMPLETED" | "CANCELLED";

/** What a captain sees: an open round whose cutoff has passed is "closed" until the cutoff job runs. */
export function displayStatus(round: { status: string; cutoffAt: Date }, now: Date): DisplayStatus {
  if (round.status === "OPEN") return round.cutoffAt.getTime() > now.getTime() ? "OPEN" : "CLOSED";
  return round.status as DisplayStatus;
}

export type UnitWords = { one: string; other: string };

/** "flat"/"flats", "room"/"rooms" from a community's unit label. */
export function unitWordsFor(label: string): UnitWords {
  const one = label.trim().toLowerCase() || "flat";
  return { one, other: /(s|x|ch|sh)$/.test(one) ? `${one}es` : `${one}s` };
}

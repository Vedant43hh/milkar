// Platform numbers by vertical (groceries, home services, repairs, subscriptions). Pure.

import type { BuyCategory } from "../categories";
import { splitInclusive } from "../pricing/price";

export type StatItem = {
  vertical: BuyCategory;
  quantity: number;
  /** What the resident finally paid for the confirmed units, GST included. */
  finalPaise: number;
  mrpPaise: number;
  gstBps: number;
  /** The vendor's final tier price per unit, GST excluded. */
  vendorUnitPaise: number;
  /** What price protection cost Milkar on these units. */
  absorbedPaise: number;
};

export type VerticalStats = {
  rounds: number;
  /** Gross merchandise value: what residents paid for confirmed items, GST included. */
  gmvPaise: number;
  savedPaise: number;
  /** Milkar's margin: residents' price before GST, less the vendor's price. */
  marginPaise: number;
  absorbedPaise: number;
  refundsPaise: number;
  visitsCompleted: number;
  ratingCount: number;
  ratingSum: number;
};

const empty = (): VerticalStats => ({ rounds: 0, gmvPaise: 0, savedPaise: 0, marginPaise: 0, absorbedPaise: 0, refundsPaise: 0, visitsCompleted: 0, ratingCount: 0, ratingSum: 0 });

export const REFUND_TYPES = [
  "TIER_REFUND",
  "DROP_REFUND",
  "CANCEL_REFUND",
  "ROUND_CANCEL_REFUND",
  "SHORT_DELIVERY_REFUND",
  "NO_ACCESS_REFUND",
  "VISIT_CANCEL_REFUND",
  "SERVICE_ISSUE_REFUND",
  "PARTS_REFUND",
] as const;
export type RefundType = (typeof REFUND_TYPES)[number];

export type StatsInput = {
  rounds: readonly { vertical: BuyCategory }[];
  items: readonly StatItem[];
  refunds: readonly { vertical: BuyCategory | null; type: string; amountPaise: number }[];
  visits: readonly { vertical: BuyCategory; status: string }[];
  ratings: readonly { vertical: BuyCategory; stars: number }[];
  polls: readonly { status: string }[];
};

export function platformStats(input: StatsInput, verticals: readonly BuyCategory[]) {
  const by = new Map<BuyCategory, VerticalStats>(verticals.map((v) => [v, empty()]));
  const total = empty();
  const both = (v: BuyCategory | null, apply: (s: VerticalStats) => void) => {
    if (v && by.has(v)) apply(by.get(v)!);
    apply(total);
  };
  for (const r of input.rounds) both(r.vertical, (s) => s.rounds++);
  for (const i of input.items) {
    const residentTaxable = splitInclusive(i.finalPaise, i.gstBps).taxablePaise;
    both(i.vertical, (s) => {
      s.gmvPaise += i.finalPaise;
      s.savedPaise += Math.max(0, i.mrpPaise * i.quantity - i.finalPaise);
      s.marginPaise += residentTaxable - i.quantity * i.vendorUnitPaise;
      s.absorbedPaise += i.absorbedPaise;
    });
  }
  const refundsByType = Object.fromEntries(REFUND_TYPES.map((t) => [t, 0])) as Record<RefundType, number>;
  for (const r of input.refunds) {
    if (!(REFUND_TYPES as readonly string[]).includes(r.type) || r.amountPaise <= 0) continue;
    refundsByType[r.type as RefundType] += r.amountPaise;
    both(r.vertical, (s) => (s.refundsPaise += r.amountPaise));
  }
  for (const v of input.visits) if (v.status === "COMPLETED") both(v.vertical, (s) => s.visitsCompleted++);
  for (const r of input.ratings)
    both(r.vertical, (s) => {
      s.ratingCount++;
      s.ratingSum += r.stars;
    });
  // Of the polls residents could vote in, how many turned into a round.
  const decided = input.polls.filter((p) => p.status !== "SUGGESTED");
  const converted = decided.filter((p) => p.status === "CONVERTED").length;
  return {
    verticals: verticals.map((v) => ({ vertical: v, ...by.get(v)! })),
    total,
    refundsByType,
    polls: { total: decided.length, converted, rate: decided.length ? converted / decided.length : 0 },
  };
}

export type PlatformStats = ReturnType<typeof platformStats>;

/** Average stars to one decimal, or null with no ratings. */
export const averageRating = (s: { ratingCount: number; ratingSum: number }) => (s.ratingCount ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : null);

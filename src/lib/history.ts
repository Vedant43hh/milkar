// What a resident paid for a round and got back, from their payments and their wallet ledger. Pure.
//
// Paid is every completed payment's charge (wallet and UPI together). Everything that came back
// for the round is a wallet credit linked to it: reductions before the freeze, better tiers and
// dropped items at cutoff, short or damaged goods, no-access visits, cancellations and complaints.
// A payment that arrived too late was never applied, so it is neither paid nor refunded here.

export type RoundPayment = { status: string; chargePaise: number };
export type RoundCredit = { type: string; amountPaise: number };

export type RoundMoney = {
  paidPaise: number;
  refundedPaise: number;
  /** What the round cost in the end. */
  netPaise: number;
  /** Credits by reason, largest first. */
  refunds: { type: string; amountPaise: number }[];
};

const NOT_A_REFUND = new Set(["ORDER_DEBIT", "LATE_PAYMENT_CREDIT"]);

export function roundMoney(payments: readonly RoundPayment[], credits: readonly RoundCredit[]): RoundMoney {
  const paidPaise = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.chargePaise, 0);
  const byType = new Map<string, number>();
  for (const c of credits) {
    if (c.amountPaise <= 0 || NOT_A_REFUND.has(c.type)) continue;
    byType.set(c.type, (byType.get(c.type) ?? 0) + c.amountPaise);
  }
  const refunds = [...byType.entries()].map(([type, amountPaise]) => ({ type, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise);
  const refundedPaise = refunds.reduce((s, r) => s + r.amountPaise, 0);
  return { paidPaise, refundedPaise, netPaise: paidPaise - refundedPaise, refunds };
}

// What a resident paid for a round and got back, from their payments and their wallet ledger. Pure.
//
// Paid is every completed payment's charge (wallet and UPI together), plus the UPI money of a
// payment that arrived too late to be applied. Everything that came back for the round is a wallet
// credit linked to it: reductions before the freeze, better tiers and dropped items at cutoff,
// short or damaged goods, no-access visits, cancellations, complaints, parts, and that late
// payment. So the list of what came back always adds up to the total shown.

export type RoundPayment = { status: string; chargePaise: number; gatewayPaise: number };
export type RoundCredit = { type: string; amountPaise: number };

export type RoundMoney = {
  paidPaise: number;
  refundedPaise: number;
  /** What the round cost in the end. */
  netPaise: number;
  /** Credits by reason, largest first. */
  refunds: { type: string; amountPaise: number }[];
};

export function roundMoney(payments: readonly RoundPayment[], credits: readonly RoundCredit[]): RoundMoney {
  const paidPaise = payments.reduce((s, p) => s + (p.status === "PAID" ? p.chargePaise : p.status === "CREDITED_TO_WALLET" ? p.gatewayPaise : 0), 0);
  const byType = new Map<string, number>();
  for (const c of credits) {
    if (c.amountPaise <= 0) continue; // wallet spending is part of a payment
    byType.set(c.type, (byType.get(c.type) ?? 0) + c.amountPaise);
  }
  const refunds = [...byType.entries()].map(([type, amountPaise]) => ({ type, amountPaise })).sort((a, b) => b.amountPaise - a.amountPaise);
  const refundedPaise = refunds.reduce((s, r) => s + r.amountPaise, 0);
  return { paidPaise, refundedPaise, netPaise: paidPaise - refundedPaise, refunds };
}

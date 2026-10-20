// What residents saved by ordering together, compared with buying at MRP. Pure.

export type SavingsItem = { mrpPaise: number; quantity: number; finalPaise: number };

/** Total saving across confirmed items; an item that cost more than MRP counts as zero, not negative. */
export function savingsVsMrp(items: readonly SavingsItem[]): number {
  return items.reduce((sum, i) => sum + Math.max(0, i.mrpPaise * i.quantity - i.finalPaise), 0);
}

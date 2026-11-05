// Reading the price tiers a vendor types into the catalogue editor. Pure.
//
// Each row is "from this many (units or flats), my price is ₹X" (GST excluded). Rows left blank
// are ignored. The result is checked again by validateTiers, the rule every round relies on.

import { parseRupeesToPaise } from "../pricing/money";
import { unitPrice } from "../pricing/price";
import { sortTiers, validateTiers, type Tier } from "../pricing/tiers";

export const MAX_TIERS = 6;

export type TierRowInput = { from: string; price: string };

export type TierProblem =
  | "NO_TIERS" // nothing filled in
  | "TOO_MANY"
  | "BAD_FROM" // not a whole number of at least 1
  | "BAD_PRICE" // not a rupee amount above zero
  | "FIRST_NOT_ONE" // the lowest tier must start at 1
  | "DUPLICATE_FROM"
  | "NOT_CHEAPER"; // a tier for more must cost less than the one before it

export type TierReading = { ok: true; tiers: Tier[] } | { ok: false; problems: { row: number | null; problem: TierProblem }[] };

const WHOLE = /^\d{1,6}$/;

function readPrice(text: string): number | null {
  try {
    const paise = parseRupeesToPaise(text);
    return paise > 0 ? paise : null;
  } catch {
    return null;
  }
}

/** `row` numbers the rows as the vendor sees them, from 1. */
export function readTierRows(rows: readonly TierRowInput[]): TierReading {
  const filled = rows.map((r, i) => ({ row: i + 1, from: r.from.trim(), price: r.price.trim() })).filter((r) => r.from !== "" || r.price !== "");
  if (filled.length === 0) return { ok: false, problems: [{ row: null, problem: "NO_TIERS" }] };
  if (filled.length > MAX_TIERS) return { ok: false, problems: [{ row: null, problem: "TOO_MANY" }] };

  const problems: { row: number | null; problem: TierProblem }[] = [];
  const read: (Tier & { row: number })[] = [];
  for (const r of filled) {
    const minQty = WHOLE.test(r.from) ? Number(r.from) : NaN;
    const price = readPrice(r.price);
    if (!(minQty >= 1)) problems.push({ row: r.row, problem: "BAD_FROM" });
    if (price === null) problems.push({ row: r.row, problem: "BAD_PRICE" });
    if (minQty >= 1 && price !== null) read.push({ row: r.row, minQty, vendorPricePaise: price });
  }
  if (problems.length > 0) return { ok: false, problems };

  const sorted = [...read].sort((a, b) => a.minQty - b.minQty);
  if (sorted[0].minQty !== 1) problems.push({ row: sorted[0].row, problem: "FIRST_NOT_ONE" });
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minQty === sorted[i - 1].minQty) problems.push({ row: sorted[i].row, problem: "DUPLICATE_FROM" });
    else if (sorted[i].vendorPricePaise >= sorted[i - 1].vendorPricePaise) problems.push({ row: sorted[i].row, problem: "NOT_CHEAPER" });
  }
  if (problems.length > 0) return { ok: false, problems };

  const tiers = sortTiers(sorted.map(({ minQty, vendorPricePaise }) => ({ minQty, vendorPricePaise })));
  // The engine's own rule has the last word.
  if (validateTiers(tiers).length > 0) return { ok: false, problems: [{ row: null, problem: "NOT_CHEAPER" }] };
  return { ok: true, tiers };
}

/** What residents would pay at each tier today: the vendor's price, plus Milkar's margin, plus GST. */
export function residentPrices(tiers: readonly Tier[], marginBps: number, gstBps: number): { minQty: number; vendorPaise: number; residentPaise: number }[] {
  return sortTiers(tiers).map((t) => ({ minQty: t.minQty, vendorPaise: t.vendorPricePaise, residentPaise: unitPrice(t.vendorPricePaise, marginBps, gstBps).totalPaise }));
}

/** Rows for the editor: the saved tiers, then blank rows up to `rows`. */
export function tierRowsFor(tiers: readonly Tier[], rows = 4): TierRowInput[] {
  const filled = sortTiers(tiers).map((t) => ({ from: String(t.minQty), price: rupeesText(t.vendorPricePaise) }));
  const target = Math.min(MAX_TIERS, Math.max(rows, filled.length + 1));
  while (filled.length < target) filled.push({ from: "", price: "" });
  return filled;
}

/** 46500 → "465", 46550 → "465.50": what a person would type, without the ₹ or commas. */
export function rupeesText(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

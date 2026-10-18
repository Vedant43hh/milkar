// Integer-paise money helpers. Nothing in this module uses floating point for amounts.

export function assertSafeInt(n: number, label = "value"): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`${label} must be a safe integer, got ${n}`);
  }
}

/**
 * amount × bps / 10000, rounded half up. 500 bps = 5%.
 * Only defined for non-negative inputs; prices and rates are never negative.
 */
export function applyBps(amountPaise: number, bps: number): number {
  assertSafeInt(amountPaise, "amountPaise");
  assertSafeInt(bps, "bps");
  if (amountPaise < 0 || bps < 0) {
    throw new RangeError("applyBps expects non-negative inputs");
  }
  const product = amountPaise * bps;
  assertSafeInt(product, "amountPaise * bps");
  return Math.floor((product + 5000) / 10000);
}

export function sumPaise(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    assertSafeInt(v, "paise");
    total += v;
  }
  assertSafeInt(total, "total");
  return total;
}

const groupFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export type PaiseDisplay = "auto" | "always" | "never";

/**
 * Formats paise as Indian rupees: 10000000 → "₹1,00,000", 46550 → "₹465.50".
 * "auto" shows the paise part only when it is non-zero.
 * "never" rounds half up to the nearest rupee.
 */
export function formatINR(paise: number, show: PaiseDisplay = "auto"): string {
  assertSafeInt(paise, "paise");
  const sign = paise < 0 ? "-" : "";
  let abs = Math.abs(paise);
  if (show === "never") abs = Math.floor((abs + 50) / 100) * 100;
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const whole = groupFormatter.format(rupees);
  const withFraction =
    show === "always" || (show === "auto" && fraction !== 0)
      ? `${whole}.${String(fraction).padStart(2, "0")}`
      : whole;
  return `${sign}₹${withFraction}`;
}

/** Parses a rupee amount typed by a person ("465", "465.5", "1,00,000.75") into paise without floats. */
export function parseRupeesToPaise(input: string): number {
  const cleaned = input.replace(/[₹,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) throw new Error(`Not a valid rupee amount: "${input}"`);
  const rupees = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const paise = rupees * 100 + fraction;
  assertSafeInt(paise, "paise");
  return paise;
}

/** Formats basis points as a percentage string: 500 → "5%", 250 → "2.5%". */
export function formatBps(bps: number): string {
  assertSafeInt(bps, "bps");
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return `${whole}%`;
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}%`;
}

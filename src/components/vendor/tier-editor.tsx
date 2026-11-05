"use client";

import { useState } from "react";
import { Input } from "@/components/ui/form";
import { interpolate } from "@/i18n/interpolate";
import { formatBps, formatINR, parseRupeesToPaise } from "@/lib/pricing/money";
import { unitPrice } from "@/lib/pricing/price";
import type { TierRowInput } from "@/lib/vendor/tier-editor";

export type TierEditorText = {
  title: string;
  intro: string;
  from: string;
  price: string;
  rowLabel: string;
  residentsPay: string;
  residentsPayHint: string;
};

function residentPrice(price: string, marginBps: number, gstBps: number): string | null {
  try {
    const paise = parseRupeesToPaise(price);
    return paise > 0 ? formatINR(unitPrice(paise, marginBps, gstBps).totalPaise) : null;
  } catch {
    return null;
  }
}

/**
 * Rows of "from N, my price ₹X" (fields tierFrom0…, tierPrice0…), each showing what residents
 * would pay at that price. The server checks the rows again when the form is saved.
 */
export function TierEditor({ rows, marginBps, gstBps, text }: { rows: TierRowInput[]; marginBps: number; gstBps: number; text: TierEditorText }) {
  const [prices, setPrices] = useState(() => rows.map((r) => r.price));
  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold text-fg">{text.title}</legend>
      <p className="text-sm text-muted">{text.intro}</p>
      <ol className="space-y-2">
        {rows.map((row, i) => {
          const label = interpolate(text.rowLabel, { n: i + 1 });
          const pay = residentPrice(prices[i] ?? "", marginBps, gstBps);
          return (
            <li key={i} className="rounded-control border border-border bg-surface-2/40 p-3">
              <p className="sr-only">{label}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-fg">{text.from}</span>
                  <Input name={`tierFrom${i}`} inputMode="numeric" defaultValue={row.from} aria-label={`${label}: ${text.from}`} autoComplete="off" />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-fg">{text.price}</span>
                  <Input
                    name={`tierPrice${i}`}
                    inputMode="decimal"
                    defaultValue={row.price}
                    aria-label={`${label}: ${text.price}`}
                    autoComplete="off"
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setPrices((p) => p.map((old, j) => (j === i ? value : old)));
                    }}
                  />
                </label>
              </div>
              <p className="mt-1.5 text-xs text-muted" aria-live="polite">
                {pay ? interpolate(text.residentsPay, { price: pay }) : " "}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-subtle">{interpolate(text.residentsPayHint, { margin: formatBps(marginBps), gst: formatBps(gstBps) })}</p>
    </fieldset>
  );
}

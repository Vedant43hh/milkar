"use client";

import { PartyPopper, Truck, TrendingDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { formatINR } from "@/lib/pricing/money";
import { EXAMPLE_BASKET, SIM_MAX_FLATS, SIM_MIN_FLATS, simulate } from "@/lib/simulator";
import { cn } from "../ui/cn";
import { ProgressBar } from "../ui/progress";

type Text = Messages["landing"]["sim"];

/**
 * The price-drop simulator: slide the number of flats joining and watch the price per flat fall
 * through the tiers, the building's savings rise and separate deliveries collapse into one.
 * Example numbers only, and labelled so.
 */
export function PriceSimulator({ text, initialFlats = 12 }: { text: Text; initialFlats?: number }) {
  const [flats, setFlats] = useState(initialFlats);
  const sliderId = useId();
  const slider = useRef<HTMLInputElement>(null);
  // On a slow phone the slider can be dragged before the page has finished loading: it moves,
  // but nothing listens yet. Once it does, start from where the slider is.
  useEffect(() => {
    const moved = Number(slider.current?.value);
    if (moved) setFlats(moved);
  }, []);
  const result = simulate(EXAMPLE_BASKET, flats);
  const flatsLabel = interpolate(text.flatsValue, { n: result.flats });
  const nextLabel = result.next ? interpolate(text.next, { n: result.next.needed, price: formatINR(result.next.pricePaise) }) : text.best;

  return (
    <div className="space-y-5 rounded-card border border-border bg-surface p-4 shadow-card sm:p-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={sliderId} className="text-sm font-medium text-fg">
            {text.flats}
          </label>
          <output htmlFor={sliderId} className="text-2xl font-bold text-brand tabular-nums">
            {flatsLabel}
          </output>
        </div>
        <input
          ref={slider}
          id={sliderId}
          type="range"
          min={SIM_MIN_FLATS}
          max={SIM_MAX_FLATS}
          step={1}
          value={result.flats}
          aria-valuetext={flatsLabel}
          onChange={(e) => setFlats(Number(e.target.value))}
          className="h-11 w-full cursor-pointer accent-[var(--brand)]"
        />
        <ol className="flex justify-between gap-1" aria-label={text.price}>
          {EXAMPLE_BASKET.tiers.map((tier, i) => (
            <li
              key={tier.minFlats}
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.7rem] font-medium tabular-nums transition-colors",
                i === result.tierIndex ? "bg-brand text-brand-fg" : i < result.tierIndex ? "bg-brand-soft text-brand-soft-fg line-through" : "bg-surface-2 text-muted",
              )}
            >
              {tier.minFlats}+ · {formatINR(tier.pricePaise)}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="text-sm text-muted">{text.price}</p>
          <p className="text-3xl font-bold text-fg tabular-nums" aria-live="polite">
            {formatINR(result.pricePaise)}
          </p>
          <p className="text-xs text-subtle">
            <s>{interpolate(text.mrp, { price: formatINR(EXAMPLE_BASKET.mrpPaise) })}</s>
          </p>
          <p className={cn("flex items-center gap-1 text-sm font-medium", result.next ? "text-accent-soft-fg" : "text-success")}>
            {result.next ? <TrendingDown aria-hidden className="size-4" /> : <PartyPopper aria-hidden className="size-4" />}
            {nextLabel}
          </p>
          <ProgressBar value={result.progress} label={nextLabel} tone={result.next ? "accent" : "success"} className="mt-1" />
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted">{text.savings}</p>
          <p className="text-3xl font-bold text-success tabular-nums">{formatINR(result.communitySavedPaise)}</p>
          <p className="text-xs text-muted">{interpolate(text.savingsPerFlat, { amount: formatINR(result.savedPerFlatPaise) })}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted">{text.trips}</p>
          <p className="flex items-center gap-2 text-3xl font-bold text-fg tabular-nums">
            <Truck aria-hidden className="size-7 text-brand" />
            {interpolate(text.tripsValue, { separate: result.separateTrips, group: result.groupTrips })}
          </p>
          <p className="text-xs text-muted">{interpolate(text.tripsBody, { separate: result.separateTrips, saved: result.tripsSaved })}</p>
        </div>
      </div>
      <p className="text-xs text-subtle">{text.example}</p>
    </div>
  );
}

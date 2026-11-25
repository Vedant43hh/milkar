"use client";

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
    <div className="space-y-5 rounded-card border border-border bg-surface p-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={sliderId} className="text-sm font-medium text-fg">
            {text.flats}
          </label>
          <output htmlFor={sliderId} className="text-xl font-semibold text-accent tabular-nums">
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
          className="h-11 w-full cursor-pointer"
        />
        <ol className="flex justify-between gap-1" aria-label={text.price}>
          {EXAMPLE_BASKET.tiers.map((tier, i) => (
            <li
              key={tier.minFlats}
              className={cn(
                "text-sm tabular-nums",
                i === result.tierIndex ? "font-semibold text-accent" : i < result.tierIndex ? "text-muted line-through" : "text-muted",
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
          <p className="text-xl font-semibold text-fg tabular-nums" aria-live="polite">
            {formatINR(result.pricePaise)}
          </p>
          <p className="text-sm text-muted">
            <s>{interpolate(text.mrp, { price: formatINR(EXAMPLE_BASKET.mrpPaise) })}</s>
          </p>
          <p className={cn("flex items-center gap-1 text-sm font-medium", result.next ? "text-accent" : "text-success")}>
            {nextLabel}
          </p>
          <ProgressBar value={result.progress} label={nextLabel} tone={result.next ? "accent" : "success"} className="mt-1" />
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted">{text.savings}</p>
          <p className="text-xl font-semibold text-success tabular-nums">{formatINR(result.communitySavedPaise)}</p>
          <p className="text-sm text-muted">{interpolate(text.savingsPerFlat, { amount: formatINR(result.savedPerFlatPaise) })}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted">{text.trips}</p>
          <p className="flex items-center gap-2 text-xl font-semibold text-fg tabular-nums">
            {interpolate(text.tripsValue, { separate: result.separateTrips, group: result.groupTrips })}
          </p>
          <p className="text-sm text-muted">{interpolate(text.tripsBody, { separate: result.separateTrips, saved: result.tripsSaved })}</p>
        </div>
      </div>
      <p className="text-sm text-muted">{text.example}</p>
    </div>
  );
}

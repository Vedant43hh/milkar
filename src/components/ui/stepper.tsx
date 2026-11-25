"use client";

import { Minus, Plus } from "lucide-react";
import { tu } from "@/i18n/ui";
import { cn } from "./cn";

/** − value + control with 44px targets. `label` names what is being counted for screen readers. */
export function QuantityStepper({
  value,
  onChange,
  label,
  min = 0,
  max,
  disabled,
  decreaseDisabled,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** e.g. reductions are frozen close to cutoff */
  decreaseDisabled?: boolean;
  className?: string;
}) {
  const canDecrease = !disabled && !decreaseDisabled && value > min;
  const canIncrease = !disabled && (max === undefined || value < max);
  const button =
    "flex size-11 items-center justify-center rounded-control border border-border bg-surface text-fg transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50";

  if (value === 0 && canIncrease) {
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        aria-label={tu("stepper.add", { item: label })}
        className={cn("inline-flex min-h-11 items-center gap-1 rounded-control border border-border bg-surface px-3 text-sm font-medium text-accent transition-colors hover:bg-surface-hover", className)}
      >
        <Plus aria-hidden className="size-4" />
        {tu("stepper.addShort")}
      </button>
    );
  }

  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-1", className)}>
      <button type="button" className={button} onClick={() => onChange(value - 1)} disabled={!canDecrease} aria-label={tu("stepper.decrease", { item: label })}>
        <Minus aria-hidden className="size-4" />
      </button>
      <output aria-live="polite" className="min-w-8 text-center text-sm font-semibold text-fg tabular-nums">
        {value}
      </output>
      <button type="button" className={button} onClick={() => onChange(value + 1)} disabled={!canIncrease} aria-label={tu("stepper.increase", { item: label })}>
        <Plus aria-hidden className="size-4" />
      </button>
    </div>
  );
}

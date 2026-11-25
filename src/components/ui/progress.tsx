import { tu } from "@/i18n/ui";
import type { Meter } from "@/lib/pricing/meter";
import { formatINR } from "@/lib/pricing/money";
import { cn } from "./cn";

const barTones = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
} as const;

export function ProgressBar({
  value,
  label,
  tone = "accent",
  className,
}: {
  /** 0–100 */
  value: number;
  label: string;
  tone?: keyof typeof barTones;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-border", className)}
    >
      <div className={cn("h-full rounded-full", barTones[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export type UnitWords = { one: string; other: string };

const plural = new Intl.PluralRules("en-IN");
/** "bag" for 1, "bags" otherwise. */
export function unitWord(count: number, words: UnitWords): string {
  return plural.select(count) === "one" ? words.one : words.other;
}

/**
 * The live price meter: the tier group's count, current price, and how far the next tier is.
 * `basisWords` names what is being counted: bags for a grocery product, flats for a service.
 */
export function TierMeter({ meter, basisWords, compact = false }: { meter: Meter; basisWords: UnitWords; compact?: boolean }) {
  const next = meter.next;
  const status = !meter.qualifies
    ? {
        tone: "warning" as const,
        text: tu("meter.qualify", { n: meter.toQualify, unit: unitWord(meter.toQualify, basisWords) }),
      }
    : next
      ? {
          tone: "accent" as const,
          text: tu("meter.unlock", { n: next.needed, unit: unitWord(next.needed, basisWords), price: formatINR(next.unitPaise) }),
        }
      : { tone: "success" as const, text: tu("meter.best") };

  const statusColor = { warning: "text-warning", accent: "text-accent", success: "text-success" }[status.tone];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">{tu("meter.joined", { n: meter.count, unit: unitWord(meter.count, basisWords) })}</span>
        <span className={cn("text-right font-medium", statusColor)}>
          {status.text}
        </span>
      </div>
      <ProgressBar value={meter.progressPct} tone={status.tone === "warning" ? "warning" : status.tone === "success" ? "success" : "accent"} label={status.text} />
      {!compact && (
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label={tu("meter.ladder")}>
          {meter.ladder.map((step) => {
            const current = step.unitPaise === meter.currentUnitPaise && step.reached;
            return (
              <li
                key={step.minQty}
                className={cn("tabular-nums", current ? "font-medium text-accent" : step.reached ? "text-muted line-through" : "text-muted")}
              >
                {tu("meter.step", { qty: `${step.minQty}+`, price: formatINR(step.unitPaise) })}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

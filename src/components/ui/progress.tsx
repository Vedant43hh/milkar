import { PartyPopper, TrendingDown, Users } from "lucide-react";
import { t } from "@/i18n";
import type { Meter } from "@/lib/pricing/meter";
import { formatINR } from "@/lib/pricing/money";
import { cn } from "./cn";

const barTones = {
  brand: "bg-brand",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
} as const;

export function ProgressBar({
  value,
  label,
  tone = "brand",
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
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", barTones[tone])} style={{ width: `${pct}%` }} />
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
        icon: <Users aria-hidden className="size-4" />,
        text: t("meter.qualify", { n: meter.toQualify, unit: unitWord(meter.toQualify, basisWords) }),
      }
    : next
      ? {
          tone: "accent" as const,
          icon: <TrendingDown aria-hidden className="size-4" />,
          text: t("meter.unlock", { n: next.needed, unit: unitWord(next.needed, basisWords), price: formatINR(next.unitPaise) }),
        }
      : { tone: "success" as const, icon: <PartyPopper aria-hidden className="size-4" />, text: t("meter.best") };

  const statusColor = { warning: "text-warning", accent: "text-accent-soft-fg", success: "text-success" }[status.tone];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">{t("meter.joined", { n: meter.count, unit: unitWord(meter.count, basisWords) })}</span>
        <span className={cn("flex items-center gap-1 font-medium", statusColor)}>
          {status.icon}
          {status.text}
        </span>
      </div>
      <ProgressBar value={meter.progressPct} tone={status.tone === "warning" ? "warning" : status.tone === "success" ? "success" : "accent"} label={status.text} />
      {!compact && (
        <ol className="flex flex-wrap gap-1.5" aria-label={t("meter.ladder")}>
          {meter.ladder.map((step) => {
            const current = step.unitPaise === meter.currentUnitPaise && step.reached;
            return (
              <li
                key={step.minQty}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs tabular-nums",
                  current ? "border-brand bg-brand-soft font-semibold text-brand-soft-fg" : step.reached ? "border-border text-subtle line-through" : "border-border text-muted",
                )}
              >
                {t("meter.step", { qty: `${step.minQty}+`, price: formatINR(step.unitPaise) })}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

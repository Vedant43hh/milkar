import { House } from "lucide-react";
import { tu } from "@/i18n/ui";
import { cn } from "./cn";

/**
 * Who has joined a group buy, by flat number only (never names, for privacy): the first few flats
 * as chips, then "+N". The whole row is one accessible sentence.
 */
export function NeighbourFlats({ flats, total, max = 4, className }: { flats: readonly string[]; total: number; max?: number; className?: string }) {
  if (total === 0) return <p className={cn("text-xs text-muted", className)}>{tu("neighbours.none")}</p>;
  const shown = flats.slice(0, max);
  const more = total - shown.length;
  const label =
    more > 0
      ? tu("neighbours.joinedMore", { n: total, flats: shown.join(", "), more })
      : tu("neighbours.joined", { n: total, flats: shown.join(", ") });
  return (
    <p role="img" aria-label={label} className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((flat) => (
        <span key={flat} aria-hidden className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[0.7rem] font-medium text-muted tabular-nums">
          <House className="size-3" />
          {flat}
        </span>
      ))}
      {more > 0 && (
        <span aria-hidden className="inline-flex h-6 items-center rounded-full bg-brand-soft px-2 text-[0.7rem] font-semibold text-brand-soft-fg tabular-nums">
          +{more}
        </span>
      )}
    </p>
  );
}

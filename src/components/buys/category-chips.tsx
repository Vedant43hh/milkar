import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { ChipScroller } from "@/components/ui/chip-scroller";
import { t } from "@/i18n";
import { BUY_CATEGORIES, CATEGORY_SLUG, type BuyCategory } from "@/lib/categories";
import { CATEGORY_LOOK } from "./group-buy-card";

/** Groceries, home services, repairs, subscriptions: a swipeable row of links with what's open in each. */
export function CategoryChips({ counts, current }: { counts: Record<BuyCategory, number>; current?: BuyCategory }) {
  return (
    <ChipScroller label={t("buys.chipsLabel")} className="mb-4">
      {BUY_CATEGORIES.map((category) => {
        const { icon: Icon } = CATEGORY_LOOK[category];
        const selected = category === current;
        return (
          <Link
            key={category}
            href={`/app/buys/${CATEGORY_SLUG[category]}`}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              selected ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-border bg-surface text-fg hover:border-brand/50",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {t(`buys.categories.${category}.name`)}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", counts[category] > 0 ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted")}>{counts[category]}</span>
          </Link>
        );
      })}
    </ChipScroller>
  );
}

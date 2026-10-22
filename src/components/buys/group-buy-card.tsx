import { ArrowRight, Repeat, ShoppingBasket, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { meterWords } from "@/components/meter-words";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Countdown } from "@/components/ui/countdown";
import { Price } from "@/components/ui/display";
import { NeighbourFlats } from "@/components/ui/neighbours";
import { TierMeter } from "@/components/ui/progress";
import { t } from "@/i18n";
import type { BuyCategory } from "@/lib/categories";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import type { GroupBuy } from "@/server/group-buys";

export const CATEGORY_LOOK: Record<BuyCategory, { icon: LucideIcon; tint: string }> = {
  GROCERIES: { icon: ShoppingBasket, tint: "bg-success-soft text-success" },
  HOME_SERVICES: { icon: Sparkles, tint: "bg-brand-soft text-brand-soft-fg" },
  REPAIRS: { icon: Wrench, tint: "bg-warning-soft text-warning" },
  SUBSCRIPTIONS: { icon: Repeat, tint: "bg-accent-soft text-accent-soft-fg" },
};

/**
 * One open group buy: today's price and the next one, how many more flats or packs unlock it, a
 * countdown, which flats have joined (numbers only), and the resident's own order or booking.
 */
export function GroupBuyCard({ buy, unitLabel }: { buy: GroupBuy; unitLabel: string }) {
  const isService = buy.kind === "SERVICE";
  const { icon: Icon, tint } = CATEGORY_LOOK[buy.category];
  const status = isService
    ? buy.booking
      ? t("home.booked", { slot: formatIST(buy.booking.slot.startsAt) })
      : t("home.notBooked")
    : buy.myUnits > 0
      ? t("home.yourOrder", { units: buy.myUnits, paid: formatINR(buy.myPaidPaise) })
      : t("home.notOrdered");
  const cta = isService ? (buy.booking ? t("home.view") : t("home.bookNow")) : buy.myUnits > 0 ? t("home.view") : t("home.orderNow");
  const lead = buy.lead;
  const words = lead ? meterWords(lead.basis, lead.productUnit, unitLabel) : null;
  // What one unit is: a pack of rice, a split AC, a car.
  const per = lead ? (isService ? (lead.unitLabel ?? "unit") : meterWords("UNITS", lead.productUnit, unitLabel).one) : null;

  return (
    <Link href={buy.href} className="group block space-y-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Badge icon={<Icon aria-hidden className="size-3.5" />} className={cn("border-transparent", tint)}>
            {t(`buys.categories.${buy.category}.name`)}
          </Badge>
          <h3 className="font-semibold text-fg">{buy.title}</h3>
          <p className="text-sm">
            <Countdown to={buy.cutoffAt.toISOString()} />
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand">
          {cta}
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {lead && words && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 truncate text-sm font-medium text-fg">{lead.name}</p>
            <Price paise={lead.meter.currentUnitPaise} mrpPaise={lead.mrpPaise} suffix={t("groupBuy.perUnit", { unit: per ?? "" })} />
          </div>
          <TierMeter meter={lead.meter} basisWords={words} compact />
        </div>
      )}
      {!isService && buy.itemCount > 1 && <p className="text-xs text-muted">{t("groupBuy.items", { n: buy.itemCount })}</p>}
      <NeighbourFlats flats={buy.flats} total={buy.flats.length} />
      <p className="text-sm text-muted">{status}</p>
    </Link>
  );
}

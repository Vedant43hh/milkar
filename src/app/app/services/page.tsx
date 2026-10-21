import { ArrowRight, BadgeCheck, CalendarCheck, Megaphone, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { EmptyState } from "@/components/ui/display";
import { TierMeter } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { computeMeter } from "@/lib/pricing/meter";
import { formatINR } from "@/lib/pricing/money";
import { unitWordsFor } from "@/lib/rounds";
import { listServiceDays } from "@/server/service-days";

export const metadata: Metadata = { title: t("serviceDay.listTitle") };

export default function ServicesPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Services />
    </Suspense>
  );
}

async function Services() {
  const user = await requirePortal("app");
  const community = user.flat.community;
  const days = await listServiceDays(community.id, user.flatId, new Date());
  const words = unitWordsFor(community.unitLabel);

  return (
    <div>
      <PageHeader title={t("serviceDay.listTitle")} subtitle={t("serviceDay.listIntro")} />
      {days.length === 0 ? (
        <EmptyState
          icon={<Sparkles aria-hidden className="size-6" />}
          title={t("serviceDay.noDays")}
          body={t("serviceDay.noDaysBody")}
          action={
            <ButtonLink href="/app/polls" variant="secondary" icon={<Megaphone aria-hidden className="size-4" />}>
              {t("serviceDay.seePolls")}
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {days.map((d) => (
            <li key={d.id}>
              <Link href={`/app/services/${d.id}`} className="group block space-y-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-semibold text-fg">{d.title}</h2>
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                      {t("serviceDay.by", { vendor: d.vendor })}
                      {d.verified && (
                        <Badge tone="success" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
                          {t("serviceDay.verified")}
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted">{d.days.join(", ")}</p>
                    <p className="text-sm">
                      <Countdown to={d.cutoffAt.toISOString()} />
                    </p>
                  </div>
                  <ArrowRight aria-hidden className="mt-1 size-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                </div>
                {d.meterInput && <TierMeter meter={computeMeter(d.meterInput, d.flats)} basisWords={words} compact />}
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  {d.cheapest && <span className="text-muted">{t("serviceDay.from", { price: formatINR(d.cheapest.paise), unit: d.cheapest.unitLabel })}</span>}
                  {d.booking ? (
                    <Badge tone={d.booking.status === "HELD" ? "accent" : "brand"} icon={<CalendarCheck aria-hidden className="size-3.5" />}>
                      {d.booking.status === "HELD" ? t("serviceDay.heldBadge") : t("serviceDay.yourBooking", { slot: d.booking.label })}
                    </Badge>
                  ) : (
                    <span className="text-muted">{t("serviceDay.notBooked")}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

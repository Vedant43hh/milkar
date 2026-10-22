import { BadgeCheck, ChevronLeft, Clock, DoorClosed, Snowflake, Star, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ServiceBooking } from "@/components/services/service-booking";
import { Badge } from "@/components/ui/badge";
import { Countdown } from "@/components/ui/countdown";
import { Banner } from "@/components/ui/display";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { getServiceDay } from "@/server/service-days";

export const metadata: Metadata = { title: t("serviceDay.listTitle") };

export default function ServiceDayPage({ params }: PageProps<"/app/services/[roundId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <ServiceDayScreen params={params} />
    </Suspense>
  );
}

async function ServiceDayScreen({ params }: { params: PageProps<"/app/services/[roundId]">["params"] }) {
  const user = await requirePortal("app");
  const { roundId } = await params;
  const community = user.flat.community;
  const day = await getServiceDay({ id: user.id, flatId: user.flatId, communityId: community.id }, roundId, community.unitLabel, new Date());
  if (!day) notFound();
  const { round, service } = day;

  return (
    <PullToRefresh>
      <div className="space-y-4">
        <Link href="/app/services" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
          <ChevronLeft aria-hidden className="size-4" />
          {t("serviceDay.listTitle")}
        </Link>
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{round.title}</h1>
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            {t("serviceDay.by", { vendor: service.vendor })}
            {service.verified && (
              <Badge tone="success" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
                {t("serviceDay.verified")}
              </Badge>
            )}
            {service.rating && (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Star aria-hidden className="size-3.5 fill-current text-accent" />
                {t("serviceDay.rating", { rating: service.rating.average, count: service.rating.count })}
              </span>
            )}
          </p>
          <p className="text-sm text-fg">{service.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Countdown to={round.cutoffAt} />
            <span className="inline-flex items-center gap-1 text-muted">
              <Timer aria-hidden className="size-3.5" />
              {t("serviceDay.duration", { minutes: service.durationMinutes })}
            </span>
          </div>
          {round.canReduce ? (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Clock aria-hidden className="size-3.5" />
              {t("shop.freezeNote", { when: formatIST(new Date(round.freezeAt)) })}
            </p>
          ) : (
            <Banner tone={round.canAdd ? "warning" : "danger"} icon={<Snowflake aria-hidden className="size-4" />}>
              {t(round.canAdd ? "shop.frozen" : "shop.closed")}
            </Banner>
          )}
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <DoorClosed aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t("serviceDay.visitFee", { fee: formatINR(round.noAccessFeePaise) })}
          </p>
        </header>
        <ServiceBooking day={day} text={messages().serviceDay} shopText={messages().shop} />
      </div>
    </PullToRefresh>
  );
}

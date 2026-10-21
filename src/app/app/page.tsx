import { ArrowRight, CalendarClock, KeyRound, PiggyBank, ShoppingBasket, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { meterWords } from "@/components/meter-words";
import { ResidentPollCard } from "@/components/polls/poll-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Banner, EmptyState, Stat } from "@/components/ui/display";
import { TierMeter } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { getResidentHome, type ResidentHome } from "@/server/home";

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResidentHomePage />
    </Suspense>
  );
}

async function ResidentHomePage() {
  const user = await requirePortal("app");
  const community = user.flat.community;
  const home = await getResidentHome({ id: user.id, flatId: user.flatId, communityId: community.id }, new Date());

  return (
    <div>
      <PageHeader
        title={t("home.greeting", { name: user.name?.split(" ")[0] ?? "" })}
        subtitle={t("home.flatIn", { unit: community.unitLabel, flat: `${user.flat.tower}-${user.flat.number}`, community: community.name })}
      />

      <div className="space-y-3">
        {home.held.map((h) => (
          <Banner
            key={h.roundId}
            tone="accent"
            icon={<CalendarClock aria-hidden className="size-4" />}
            title={t("home.held", { service: h.round.service?.name ?? "", until: formatIST(h.holdExpiresAt!) })}
            action={
              <ButtonLink href={`/app/services/${h.roundId}`} size="sm" variant="accent">
                {t("home.confirmHeld")}
              </ButtonLink>
            }
          >
            {t("home.heldBody", { slot: formatIST(h.slot.startsAt) })}
          </Banner>
        ))}

        <Card className="grid grid-cols-2 gap-4">
          <Stat label={t("home.savedThisMonth")} value={formatINR(home.savingsPaise)} hint={t("home.savedHint")} icon={<PiggyBank aria-hidden className="size-5" />} tone="accent" />
          <Stat label={t("home.wallet")} value={formatINR(home.walletPaise)} hint={t("home.walletHint")} icon={<Wallet aria-hidden className="size-5" />} tone="brand" />
        </Card>
      </div>

      <section aria-labelledby="open-now">
        <SectionTitle>
          <span id="open-now">{t("home.activeRounds")}</span>
        </SectionTitle>
        {home.openRounds.length === 0 ? (
          <EmptyState icon={<ShoppingBasket aria-hidden className="size-6" />} title={t("home.activeRoundsEmpty")} body={t("home.activeRoundsEmptyBody")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {home.openRounds.map((round) => (
              <RoundTeaser key={round.id} round={round} unitLabel={community.unitLabel} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="visits">
        <SectionTitle>
          <span id="visits">{t("home.upcomingVisits")}</span>
        </SectionTitle>
        {home.visits.length === 0 ? (
          <EmptyState icon={<CalendarClock aria-hidden className="size-6" />} title={t("home.upcomingVisitsEmpty")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {home.visits.map((visit) => (
              <li key={visit.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
                  <Sparkles aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg">{visit.round.service?.name}</span>
                  <span className="block text-sm text-muted">{t("home.visitWhen", { when: formatIST(visit.startsAt), technician: visit.technicianName ?? "" })}</span>
                </span>
                <span className="flex flex-col items-end" title={t("home.codeHint")}>
                  <Badge tone="accent" icon={<KeyRound aria-hidden className="size-3.5" />}>
                    {t("home.code", { code: visit.completionCode })}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
        {home.visits.length > 0 && <p className="mt-2 text-xs text-muted">{t("home.codeHint")}</p>}
      </section>

      <section aria-labelledby="polls">
        <SectionTitle
          action={
            <ButtonLink href="/app/polls" variant="ghost" size="sm">
              {t("home.allPolls")}
            </ButtonLink>
          }
        >
          <span id="polls">{t("home.polls")}</span>
        </SectionTitle>
        {home.polls.length === 0 ? (
          <EmptyState title={t("home.pollsEmpty")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {home.polls.map((poll) => (
              <ResidentPollCard key={poll.id} poll={poll} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RoundTeaser({ round, unitLabel }: { round: ResidentHome["openRounds"][number]; unitLabel: string }) {
  const isService = round.kind === "SERVICE";
  const href = isService ? `/app/services/${round.id}` : `/app/groceries?round=${round.id}`;
  const status = isService
    ? round.booking
      ? t("home.booked", { slot: formatIST(round.booking.slot.startsAt) })
      : t("home.notBooked")
    : round.myUnits > 0
      ? t("home.yourOrder", { units: round.myUnits, paid: formatINR(round.myPaidPaise) })
      : t("home.notOrdered");
  const KindIcon = isService ? Sparkles : ShoppingBasket;
  return (
    <Link href={href} className="group block space-y-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Badge icon={<KindIcon aria-hidden className="size-3.5" />}>{t(`roundKind.${round.kind}`)}</Badge>
          <h3 className="font-semibold text-fg">{round.title}</h3>
          <p className="text-sm">
            <Countdown to={round.cutoffAt.toISOString()} />
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand">
          {isService ? (round.booking ? t("home.view") : t("home.bookNow")) : round.myUnits > 0 ? t("home.view") : t("home.orderNow")}
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {round.lead && (
        <div>
          <p className="mb-1.5 truncate text-sm font-medium text-fg">{isService ? round.serviceName : round.lead.name}</p>
          <TierMeter meter={round.lead.meter} basisWords={meterWords(round.lead.basis, round.lead.productUnit, unitLabel)} compact />
        </div>
      )}
      <p className="text-sm text-muted">{status}</p>
    </Link>
  );
}

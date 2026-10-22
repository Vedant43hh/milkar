import { ArrowRight, CalendarClock, KeyRound, Megaphone, PiggyBank, ShoppingBasket, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryChips } from "@/components/buys/category-chips";
import { GroupBuyCard } from "@/components/buys/group-buy-card";
import { ImpactCard } from "@/components/impact/impact-card";
import { ResidentPollCard } from "@/components/polls/poll-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { Banner, EmptyState, Stat } from "@/components/ui/display";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { getResidentHome } from "@/server/home";

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
    <PullToRefresh>
      <PageHeader
        title={t("home.greeting", { name: user.name?.split(" ")[0] ?? "" })}
        subtitle={t("home.flatIn", { unit: community.unitLabel, flat: `${user.flat.tower}-${user.flat.number}`, community: community.name })}
      />

      <CategoryChips counts={home.categoryCounts} />

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
          <Link href="/app/wallet" className="rounded-control">
            <Stat label={t("home.wallet")} value={formatINR(home.walletPaise)} hint={t("home.walletHint")} icon={<Wallet aria-hidden className="size-5" />} tone="brand" />
          </Link>
        </Card>
      </div>

      <section aria-labelledby="open-now">
        <SectionTitle>
          <span id="open-now">{t("home.activeRounds")}</span>
        </SectionTitle>
        {home.openRounds.length === 0 ? (
          <EmptyState
            icon={<ShoppingBasket aria-hidden className="size-6" />}
            title={t("home.activeRoundsEmpty")}
            body={t("home.activeRoundsEmptyBody")}
            action={
              <ButtonLink href="/app/polls" variant="secondary" icon={<Megaphone aria-hidden className="size-4" />}>
                {t("buys.vote")}
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {home.openRounds.map((buy) => (
              <GroupBuyCard key={buy.id} buy={buy} unitLabel={community.unitLabel} />
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
              <li key={visit.id}>
                <Link href={`/app/orders/${visit.roundId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
                    <Sparkles aria-hidden className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{visit.round.service?.name}</span>
                    <span className="block text-sm text-muted">{t("home.visitWhen", { when: formatIST(visit.startsAt), technician: visit.technicianName ?? "" })}</span>
                  </span>
                  <Badge tone="accent" icon={<KeyRound aria-hidden className="size-3.5" />}>
                    {t("home.code", { code: visit.completionCode })}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {home.visits.length > 0 && <p className="mt-2 text-xs text-muted">{t("home.codeHint")}</p>}
      </section>

      <div className="mt-6">
        <ImpactCard impact={home.impact} community={community.name} />
      </div>

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
    </PullToRefresh>
  );
}

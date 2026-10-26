import { CalendarCheck, ClipboardList, IndianRupee, Lightbulb, Megaphone, MessageSquareWarning, PiggyBank, Repeat, ShoppingBasket, Sparkles, Truck, UserCheck, Users, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ImpactCard } from "@/components/impact/impact-card";
import { ReadyPollCard } from "@/components/manager/poll-cards";
import { RoundCard, RoundStatusBadges } from "@/components/manager/round-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui/card";
import { Banner, EmptyState, ListRow, Stat } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { displayStatus, unitWordsFor } from "@/lib/rounds";
import { formatIST } from "@/lib/time";
import { getCommunityImpact } from "@/server/impact";
import { getManagerHome } from "@/server/manager-home";
import { listCommunityPolls } from "@/server/polls";
import { listCommunityRounds } from "@/server/rounds";

export const metadata: Metadata = { title: t("areas.managerTitle") };

export default function ManagerPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <ManagerHome />
    </Suspense>
  );
}

async function ManagerHome() {
  const user = await requirePortal("manager");
  const now = new Date();
  const { community } = user.staff;
  const [home, impact, rounds, polls] = await Promise.all([getManagerHome(community.id, now), getCommunityImpact(community.id), listCommunityRounds(community.id), listCommunityPolls(community.id)]);
  const live = rounds.filter((r) => r.status === "OPEN");
  const recent = rounds.filter((r) => r.status !== "OPEN").slice(0, 3);
  const ready = polls.filter((p) => p.status === "OPEN" && p._count.votes >= p.threshold);
  const suggestions = polls.filter((p) => p.status === "SUGGESTED");
  const units = unitWordsFor(community.unitLabel).other;
  const waiting = home.pendingJoins > 0 || home.openIssues > 0 || ready.length > 0 || suggestions.length > 0;

  return (
    <div>
      <PageHeader title={t("areas.managerTitle")} subtitle={t("manager.overviewIntro", { community: community.name })} />
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/manager/rounds/new/grocery" icon={<ShoppingBasket aria-hidden className="size-4" />}>
          {t("manager.newGrocery")}
        </ButtonLink>
        <ButtonLink href="/manager/rounds/new/service?kind=home-services" variant="secondary" icon={<Sparkles aria-hidden className="size-4" />}>
          {t("manager.newService")}
        </ButtonLink>
        <ButtonLink href="/manager/rounds/new/service?kind=repairs" variant="secondary" icon={<Wrench aria-hidden className="size-4" />}>
          {t("managerHome.newRepair")}
        </ButtonLink>
        <ButtonLink href="/manager/rounds/new/service?kind=subscriptions" variant="secondary" icon={<Repeat aria-hidden className="size-4" />}>
          {t("managerHome.newSubscription")}
        </ButtonLink>
        <ButtonLink href="/manager/polls/new" variant="ghost" icon={<Megaphone aria-hidden className="size-4" />}>
          {t("manager.newPoll")}
        </ButtonLink>
      </div>

      <Card labelledBy="stats-title" className="mt-5">
        <CardHeader titleId="stats-title" title={t("managerHome.stats", { community: community.name })} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={t("managerHome.residents")} value={home.residents} hint={t("managerHome.residentsHint", { flats: home.flats, units })} icon={<Users aria-hidden className="size-5" />} tone="brand" />
          <Stat label={t("managerHome.activeFlats")} value={home.activeFlats} hint={t("managerHome.activeFlatsHint", { units })} icon={<UserCheck aria-hidden className="size-5" />} tone="brand" />
          <Stat label={t("managerHome.openRounds")} value={home.openRounds} icon={<ClipboardList aria-hidden className="size-5" />} />
          <Stat label={t("managerHome.gmv")} value={formatINR(home.gmvPaise)} icon={<IndianRupee aria-hidden className="size-5" />} tone="success" />
          <Stat label={t("managerHome.saved")} value={formatINR(home.savedPaise)} hint={t("managerHome.savedHint")} icon={<PiggyBank aria-hidden className="size-5" />} tone="accent" />
        </div>
      </Card>

      {waiting && (
        <section aria-labelledby="needs-you">
          <SectionTitle>
            <span id="needs-you">{t("manager.needsYou")}</span>
          </SectionTitle>
          <div className="space-y-3">
            {home.pendingJoins > 0 && (
              <Banner
                icon={<UserCheck aria-hidden className="size-4" />}
                action={
                  <ButtonLink href="/manager/residents" variant="secondary" size="sm">
                    {t("manager.review")}
                  </ButtonLink>
                }
              >
                {t("managerHome.joinRequests", { n: home.pendingJoins })}
              </Banner>
            )}
            {home.openIssues > 0 && (
              <Banner
                tone="warning"
                icon={<MessageSquareWarning aria-hidden className="size-4" />}
                action={
                  <ButtonLink href="/manager/issues" variant="secondary" size="sm">
                    {t("manager.review")}
                  </ButtonLink>
                }
              >
                {t("managerHome.complaints", { n: home.openIssues })}
              </Banner>
            )}
            {ready.map((poll) => (
              <ReadyPollCard key={poll.id} poll={poll} />
            ))}
            {suggestions.length > 0 && (
              <Banner
                icon={<Lightbulb aria-hidden className="size-4" />}
                action={
                  <ButtonLink href="/manager/polls" variant="secondary" size="sm">
                    {t("manager.review")}
                  </ButtonLink>
                }
              >
                {t("manager.suggestionsWaiting", { n: suggestions.length })}
              </Banner>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="today">
        <SectionTitle>
          <span id="today">{t("managerHome.today")}</span>
        </SectionTitle>
        {home.distributions.length === 0 && home.visitDays.length === 0 ? (
          <p className="text-sm text-muted">{t("managerHome.nothingToday")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {home.distributions.map((d) => (
              <li key={d.id}>
                <ListRow
                  href={`/manager/distribution/${d.id}`}
                  icon={<Truck aria-hidden className="size-5" />}
                  title={t("managerHome.handout", { round: d.title })}
                  subtitle={t("managerHome.handoutProgress", { collected: d.collected, total: d.total })}
                />
              </li>
            ))}
            {home.visitDays.map((v) => (
              <li key={v.id}>
                <ListRow
                  href={`/manager/visits/${v.id}`}
                  icon={<CalendarCheck aria-hidden className="size-5" />}
                  title={t("managerHome.visitDay", { round: v.title })}
                  subtitle={t("managerHome.visitProgress", { done: v.done, total: v.visits })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="open-now">
        <SectionTitle>
          <span id="open-now">{t("manager.openNow")}</span>
        </SectionTitle>
        {live.length === 0 ? (
          <EmptyState icon={<ClipboardList aria-hidden className="size-6" />} title={t("manager.openNowEmpty")} body={t("manager.openNowEmptyBody")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {live.map((round) => (
              <RoundCard key={round.id} round={round} unitLabel={community.unitLabel} now={now} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6">
        <ImpactCard impact={impact} community={community.name} />
      </div>

      {recent.length > 0 && (
        <section aria-labelledby="recent-rounds">
          <SectionTitle
            action={
              <ButtonLink href="/manager/rounds" variant="ghost" size="sm">
                {t("manager.allRounds")}
              </ButtonLink>
            }
          >
            <span id="recent-rounds">{t("manager.recent")}</span>
          </SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {recent.map((round) => (
              <li key={round.id}>
                <ListRow
                  href={`/manager/rounds/${round.id}`}
                  title={round.title}
                  subtitle={formatIST(round.cutoffAt, "date")}
                  trailing={<RoundStatusBadges kind={round.kind} status={displayStatus(round, now)} />}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

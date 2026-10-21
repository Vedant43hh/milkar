import { ClipboardList, Lightbulb, Megaphone, ShoppingBasket, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ReadyPollCard } from "@/components/manager/poll-cards";
import { RoundCard, RoundStatusBadges } from "@/components/manager/round-card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { Banner, EmptyState, ListRow } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { displayStatus } from "@/lib/rounds";
import { formatIST } from "@/lib/time";
import { listCommunityPolls } from "@/server/polls";
import { listCommunityRounds } from "@/server/rounds";

export const metadata: Metadata = { title: t("areas.managerTitle") };

export default function ManagerPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <ManagerHome />
    </Suspense>
  );
}

async function ManagerHome() {
  const user = await requirePortal("manager");
  const now = new Date();
  const { community } = user.staff;
  const [rounds, polls] = await Promise.all([listCommunityRounds(community.id), listCommunityPolls(community.id)]);
  const live = rounds.filter((r) => r.status === "OPEN");
  const recent = rounds.filter((r) => r.status !== "OPEN").slice(0, 3);
  const ready = polls.filter((p) => p.status === "OPEN" && p._count.votes >= p.threshold);
  const suggestions = polls.filter((p) => p.status === "SUGGESTED");

  return (
    <div>
      <PageHeader title={t("areas.managerTitle")} subtitle={t("manager.overviewIntro", { community: community.name })} />
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/manager/rounds/new/grocery" icon={<ShoppingBasket aria-hidden className="size-4" />}>
          {t("manager.newGrocery")}
        </ButtonLink>
        <ButtonLink href="/manager/rounds/new/service" variant="secondary" icon={<Sparkles aria-hidden className="size-4" />}>
          {t("manager.newService")}
        </ButtonLink>
        <ButtonLink href="/manager/polls/new" variant="secondary" icon={<Megaphone aria-hidden className="size-4" />}>
          {t("manager.newPoll")}
        </ButtonLink>
      </div>

      {(ready.length > 0 || suggestions.length > 0) && (
        <section aria-labelledby="needs-you">
          <SectionTitle>
            <span id="needs-you">{t("manager.needsYou")}</span>
          </SectionTitle>
          <div className="space-y-3">
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

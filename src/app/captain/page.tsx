import { ClipboardList, Lightbulb, Megaphone, ShoppingBasket, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ReadyPollCard } from "@/components/captain/poll-cards";
import { RoundCard, RoundStatusBadges } from "@/components/captain/round-card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { Banner, EmptyState, ListRow } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { displayStatus } from "@/lib/rounds";
import { formatIST } from "@/lib/time";
import { listCommunityPolls } from "@/server/polls";
import { listCommunityRounds } from "@/server/rounds";

export const metadata: Metadata = { title: t("areas.captainTitle") };

export default function CaptainPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <CaptainHome />
    </Suspense>
  );
}

async function CaptainHome() {
  const user = await requireArea("captain");
  const now = new Date();
  const { community } = user.flat;
  const [rounds, polls] = await Promise.all([listCommunityRounds(community.id), listCommunityPolls(community.id)]);
  const live = rounds.filter((r) => r.status === "OPEN");
  const recent = rounds.filter((r) => r.status !== "OPEN").slice(0, 3);
  const ready = polls.filter((p) => p.status === "OPEN" && p._count.votes >= p.threshold);
  const suggestions = polls.filter((p) => p.status === "SUGGESTED");

  return (
    <div>
      <PageHeader title={t("areas.captainTitle")} subtitle={t("captain.overviewIntro", { community: community.name })} />
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/captain/rounds/new/grocery" icon={<ShoppingBasket aria-hidden className="size-4" />}>
          {t("captain.newGrocery")}
        </ButtonLink>
        <ButtonLink href="/captain/rounds/new/service" variant="secondary" icon={<Sparkles aria-hidden className="size-4" />}>
          {t("captain.newService")}
        </ButtonLink>
        <ButtonLink href="/captain/polls/new" variant="secondary" icon={<Megaphone aria-hidden className="size-4" />}>
          {t("captain.newPoll")}
        </ButtonLink>
      </div>

      {(ready.length > 0 || suggestions.length > 0) && (
        <section aria-labelledby="needs-you">
          <SectionTitle>
            <span id="needs-you">{t("captain.needsYou")}</span>
          </SectionTitle>
          <div className="space-y-3">
            {ready.map((poll) => (
              <ReadyPollCard key={poll.id} poll={poll} />
            ))}
            {suggestions.length > 0 && (
              <Banner
                icon={<Lightbulb aria-hidden className="size-4" />}
                action={
                  <ButtonLink href="/captain/polls" variant="secondary" size="sm">
                    {t("captain.review")}
                  </ButtonLink>
                }
              >
                {t("captain.suggestionsWaiting", { n: suggestions.length })}
              </Banner>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="open-now">
        <SectionTitle>
          <span id="open-now">{t("captain.openNow")}</span>
        </SectionTitle>
        {live.length === 0 ? (
          <EmptyState icon={<ClipboardList aria-hidden className="size-6" />} title={t("captain.openNowEmpty")} body={t("captain.openNowEmptyBody")} />
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
              <ButtonLink href="/captain/rounds" variant="ghost" size="sm">
                {t("captain.allRounds")}
              </ButtonLink>
            }
          >
            <span id="recent-rounds">{t("captain.recent")}</span>
          </SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {recent.map((round) => (
              <li key={round.id}>
                <ListRow
                  href={`/captain/rounds/${round.id}`}
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

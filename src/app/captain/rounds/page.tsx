import { ClipboardList, Plus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundCard, RoundStatusBadges } from "@/components/captain/round-card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState, ListRow } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t, type MessageKey } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { displayStatus } from "@/lib/rounds";
import { formatIST } from "@/lib/time";
import { statsOf } from "@/components/captain/round-view";
import { listCommunityRounds } from "@/server/rounds";

export const metadata: Metadata = { title: t("captain.roundsTitle") };

export default function RoundsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Rounds />
    </Suspense>
  );
}

async function Rounds() {
  const user = await requireArea("captain");
  const now = new Date();
  const { community } = user.flat;
  const rounds = await listCommunityRounds(community.id);
  const groups: { key: MessageKey; rounds: typeof rounds; cards: boolean }[] = [
    { key: "captain.sectionOpen", rounds: rounds.filter((r) => displayStatus(r, now) === "OPEN"), cards: true },
    { key: "captain.sectionClosed", rounds: rounds.filter((r) => ["CLOSED", "FINALIZING"].includes(displayStatus(r, now))), cards: true },
    { key: "captain.sectionConfirmed", rounds: rounds.filter((r) => displayStatus(r, now) === "FINALIZED"), cards: false },
    { key: "captain.sectionPast", rounds: rounds.filter((r) => ["DROPPED", "COMPLETED", "CANCELLED"].includes(displayStatus(r, now))), cards: false },
  ];

  return (
    <div>
      <PageHeader
        title={t("captain.roundsTitle")}
        subtitle={t("captain.roundsIntro", { community: community.name })}
        action={
          <ButtonLink href="/captain/rounds/new" size="sm" icon={<Plus aria-hidden className="size-4" />}>
            {t("captain.newRound")}
          </ButtonLink>
        }
      />
      {rounds.length === 0 && <EmptyState icon={<ClipboardList aria-hidden className="size-6" />} title={t("captain.noRounds")} body={t("captain.noRoundsBody")} />}
      {groups
        .filter((g) => g.rounds.length > 0)
        .map((g) => (
          <section key={g.key} aria-label={t(g.key)}>
            <SectionTitle>{t(g.key)}</SectionTitle>
            {g.cards ? (
              <div className="grid gap-3 md:grid-cols-2">
                {g.rounds.map((round) => (
                  <RoundCard key={round.id} round={round} unitLabel={community.unitLabel} now={now} />
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                {g.rounds.map((round) => {
                  const stats = statsOf(round);
                  return (
                    <li key={round.id}>
                      <ListRow
                        href={`/captain/rounds/${round.id}`}
                        title={round.title}
                        subtitle={`${formatIST(round.cutoffAt, "date")} · ${t("captain.stats", { flats: stats.flats, units: stats.units, collected: formatINR(stats.collectedPaise) })}`}
                        trailing={<RoundStatusBadges kind={round.kind} status={displayStatus(round, now)} />}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
    </div>
  );
}

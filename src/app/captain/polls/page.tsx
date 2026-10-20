import { Megaphone, Plus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DonePollRow, OpenPollCard, ReadyPollCard, SuggestionCard } from "@/components/captain/poll-cards";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { listCommunityPolls } from "@/server/polls";

export const metadata: Metadata = { title: t("captain.polls.title") };

export default function PollsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Polls />
    </Suspense>
  );
}

async function Polls() {
  const user = await requireArea("captain");
  const polls = await listCommunityPolls(user.flat.community.id);
  const ready = polls.filter((p) => p.status === "OPEN" && p._count.votes >= p.threshold);
  const suggestions = polls.filter((p) => p.status === "SUGGESTED");
  const open = polls.filter((p) => p.status === "OPEN" && p._count.votes < p.threshold).sort((a, b) => b._count.votes / b.threshold - a._count.votes / a.threshold);
  const done = polls.filter((p) => p.status === "CONVERTED" || p.status === "CLOSED");

  return (
    <div>
      <PageHeader
        title={t("captain.polls.title")}
        subtitle={t("captain.polls.intro")}
        action={
          <ButtonLink href="/captain/polls/new" size="sm" icon={<Plus aria-hidden className="size-4" />}>
            {t("captain.newPoll")}
          </ButtonLink>
        }
      />
      {polls.length === 0 && <EmptyState icon={<Megaphone aria-hidden className="size-6" />} title={t("captain.polls.empty")} body={t("captain.polls.emptyBody")} />}
      {ready.length > 0 && (
        <section aria-labelledby="ready">
          <SectionTitle>
            <span id="ready">{t("captain.polls.ready")}</span>
          </SectionTitle>
          <div className="space-y-3">
            {ready.map((poll) => (
              <ReadyPollCard key={poll.id} poll={poll} />
            ))}
          </div>
        </section>
      )}
      {suggestions.length > 0 && (
        <section aria-labelledby="suggestions">
          <SectionTitle>
            <span id="suggestions">{t("captain.polls.suggestions")}</span>
          </SectionTitle>
          <div className="space-y-3">
            {suggestions.map((poll) => (
              <SuggestionCard key={poll.id} poll={poll} />
            ))}
          </div>
        </section>
      )}
      {open.length > 0 && (
        <section aria-labelledby="collecting">
          <SectionTitle>
            <span id="collecting">{t("captain.polls.open")}</span>
          </SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {open.map((poll) => (
              <OpenPollCard key={poll.id} poll={poll} />
            ))}
          </div>
        </section>
      )}
      {done.length > 0 && (
        <section aria-labelledby="done">
          <SectionTitle>
            <span id="done">{t("captain.polls.done")}</span>
          </SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {done.map((poll) => (
              <DonePollRow key={poll.id} poll={poll} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

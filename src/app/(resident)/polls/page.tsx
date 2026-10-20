import { Lightbulb, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResidentPollCard } from "@/components/polls/poll-card";
import { Badge, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { listMySuggestions, listResidentPolls } from "@/server/polls";

export const metadata: Metadata = { title: t("polls.title") };

const STATUS_TONE: Record<string, Tone> = { SUGGESTED: "warning", OPEN: "brand", CONVERTED: "success", CLOSED: "neutral" };

export default function PollsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Polls />
    </Suspense>
  );
}

async function Polls() {
  const user = await requireArea("resident");
  const [polls, mine] = await Promise.all([listResidentPolls(user.flat.community.id, user.flatId), listMySuggestions(user.id)]);
  return (
    <div>
      <PageHeader
        title={t("polls.title")}
        subtitle={t("polls.intro")}
        action={
          <ButtonLink href="/polls/suggest" size="sm" variant="secondary" icon={<Lightbulb aria-hidden className="size-4" />}>
            {t("polls.suggest")}
          </ButtonLink>
        }
      />
      {polls.length === 0 ? (
        <EmptyState icon={<Megaphone aria-hidden className="size-6" />} title={t("polls.empty")} body={t("polls.emptyBody")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {polls.map((poll) => (
            <ResidentPollCard key={poll.id} poll={poll} />
          ))}
        </div>
      )}
      {mine.length > 0 && (
        <section aria-labelledby="mine">
          <SectionTitle>
            <span id="mine">{t("polls.mine")}</span>
          </SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {mine.map((s) => (
              <li key={s.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate font-medium text-fg">{s.title}</span>
                <Badge tone={STATUS_TONE[s.status]}>{t(`polls.status.${s.status}`)}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

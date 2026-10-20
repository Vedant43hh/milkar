import { ArrowRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { t } from "@/i18n";
import type { ResidentPoll } from "@/server/polls";
import { PollVote, type PollVoteText } from "./poll-vote";

export function pollVoteText(): PollVoteText {
  return { join: t("polls.join"), joined: t("polls.joined"), progress: t("polls.progress"), remaining: t("polls.remaining"), reached: t("polls.reached") };
}

/** One poll for residents: what it is, how close it is, and the flat's vote. */
export function ResidentPollCard({ poll }: { poll: ResidentPoll }) {
  const target = poll.service ? `${poll.service.name} · ${poll.service.vendor.name}` : poll.product?.name;
  return (
    <Card as="article" className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
          <Megaphone aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-fg">{poll.title}</h3>
          {target && <p className="text-sm text-muted">{target}</p>}
        </div>
      </div>
      {poll.description && <p className="text-sm text-fg">{poll.description}</p>}
      {poll.status === "CONVERTED" && poll.convertedRound ? (
        <div className="flex items-center justify-between gap-2">
          <Badge tone="success">{t("polls.converted")}</Badge>
          <Link href={`/round/${poll.convertedRound.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
            {t("polls.goToRound")}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      ) : (
        <PollVote pollId={poll.id} voted={poll.voted} votes={poll._count.votes} threshold={poll.threshold} text={pollVoteText()} />
      )}
    </Card>
  );
}

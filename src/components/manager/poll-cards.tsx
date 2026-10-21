import { CircleCheck, Lightbulb, Megaphone, Rocket } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/progress";
import { t } from "@/i18n";
import { pollProgress } from "@/lib/polls";
import { closePollAction, convertPollAction, publishSuggestionAction } from "@/server/actions/manager";
import type { ManagerPoll } from "@/server/polls";

const canConvert = (poll: ManagerPoll) => (poll.kind === "SERVICE" && poll.serviceId) || (poll.kind === "PRODUCT" && poll.productId);

function target(poll: ManagerPoll): string | null {
  if (poll.service) return `${poll.service.name} · ${poll.service.vendor.name}`;
  return poll.product?.name ?? null;
}

function Votes({ poll }: { poll: ManagerPoll }) {
  const votes = poll._count.votes;
  const progress = pollProgress(votes, poll.threshold);
  const label = t("manager.polls.votes", { votes, threshold: poll.threshold });
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-fg tabular-nums">{label}</span>
        {!progress.reached && <span className="text-muted">{t("manager.polls.remaining", { n: progress.remaining })}</span>}
      </div>
      <ProgressBar value={progress.pct} label={label} tone={progress.reached ? "success" : "accent"} />
    </div>
  );
}

function ClosePollForm({ poll, suggestion = false }: { poll: ManagerPoll; suggestion?: boolean }) {
  return (
    <ActionForm action={closePollAction}>
      <input type="hidden" name="pollId" value={poll.id} />
      {suggestion && <input type="hidden" name="suggestion" value="1" />}
      <SubmitButton variant="ghost" size="sm">
        {suggestion ? t("manager.polls.dismiss") : t("manager.polls.closePoll")}
      </SubmitButton>
    </ActionForm>
  );
}

/** A poll past its threshold: one tap opens a pre-filled round. */
export function ReadyPollCard({ poll }: { poll: ManagerPoll }) {
  return (
    <Card as="article" className="space-y-3 border-accent/40">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
          <Rocket aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-fg">{poll.title}</h3>
          {target(poll) && <p className="text-sm text-muted">{target(poll)}</p>}
        </div>
      </div>
      <Votes poll={poll} />
      {canConvert(poll) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{t("manager.pollReadyBody")}</p>
          <ActionForm action={convertPollAction}>
            <input type="hidden" name="pollId" value={poll.id} />
            <SubmitButton variant="accent" icon={<Rocket aria-hidden className="size-4" />}>
              {t("manager.openRound")}
            </SubmitButton>
          </ActionForm>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{t("manager.polls.noCatalogue")}</p>
          <ClosePollForm poll={poll} />
        </div>
      )}
    </Card>
  );
}

/** A resident's idea, waiting for the manager to publish or dismiss it. */
export function SuggestionCard({ poll }: { poll: ManagerPoll }) {
  const by = poll.suggestedBy ? `${poll.suggestedBy.name ?? ""}${poll.suggestedBy.flat ? ` (${poll.suggestedBy.flat.tower}-${poll.suggestedBy.flat.number})` : ""}` : "";
  const thresholdId = `threshold-${poll.id}`;
  return (
    <Card as="article" className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Lightbulb aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-fg">{poll.title}</h3>
          <p className="text-sm text-muted">{t("manager.polls.suggestedBy", { name: by })}</p>
          {target(poll) && <p className="text-sm text-muted">{target(poll)}</p>}
        </div>
      </div>
      {poll.description && <p className="text-sm text-fg">{poll.description}</p>}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <ActionForm action={publishSuggestionAction} className="flex items-end gap-2">
          <input type="hidden" name="pollId" value={poll.id} />
          <span>
            <label htmlFor={thresholdId} className="mb-1 block text-xs font-medium text-muted">
              {t("manager.polls.thresholdLabel")}
            </label>
            <Input id={thresholdId} type="number" name="threshold" min={2} max={500} defaultValue={poll.threshold} className="w-20 text-center" />
          </span>
          <SubmitButton size="sm" icon={<Megaphone aria-hidden className="size-4" />}>
            {t("manager.polls.publish")}
          </SubmitButton>
        </ActionForm>
        <ClosePollForm poll={poll} suggestion />
      </div>
    </Card>
  );
}

/** A published poll still collecting votes. */
export function OpenPollCard({ poll }: { poll: ManagerPoll }) {
  return (
    <Card as="article" className="space-y-3">
      <div>
        <h3 className="font-semibold text-fg">{poll.title}</h3>
        {target(poll) && <p className="text-sm text-muted">{target(poll)}</p>}
      </div>
      <Votes poll={poll} />
      <div className="flex justify-end">
        <ClosePollForm poll={poll} />
      </div>
    </Card>
  );
}

/** A converted or closed poll. */
export function DonePollRow({ poll }: { poll: ManagerPoll }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg">{poll.title}</span>
        <span className="block text-sm text-muted tabular-nums">{t("manager.polls.votes", { votes: poll._count.votes, threshold: poll.threshold })}</span>
      </span>
      {poll.convertedRound ? (
        <Link href={`/manager/rounds/${poll.convertedRound.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
          <CircleCheck aria-hidden className="size-4" />
          {t("manager.polls.viewRound")}
        </Link>
      ) : (
        <Badge>{t("manager.polls.closedLabel")}</Badge>
      )}
    </li>
  );
}

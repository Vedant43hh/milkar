import { Ban, Check, CircleDot, KeyRound, MessageSquareWarning, Star, UserRound } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { messages, t } from "@/i18n";
import { formatIST } from "@/lib/time";
import { reportIssueAction } from "@/server/actions/orders";
import type { RoundHistory } from "@/server/history";
import { MAX_NOTE, MIN_NOTE } from "@/server/visit-feedback";
import { RatingForm } from "./rating-form";

type Visit = RoundHistory["visits"][number];

const STATUS_TONE = { SCHEDULED: "brand", ON_THE_WAY: "accent", IN_PROGRESS: "accent", COMPLETED: "success", NO_ACCESS: "danger", CANCELLED: "danger" } as const;

/** Booked → on the way → started → done, with times; or how it ended instead. */
function Timeline({ visit }: { visit: Visit }) {
  return (
    <ol className="space-y-0">
      {visit.timeline.map((step, i) => {
        const last = i === visit.timeline.length - 1;
        const Icon = step.problem ? Ban : step.state === "done" ? Check : CircleDot;
        return (
          <li key={step.key} className="relative flex gap-3 pb-3 last:pb-0">
            {!last && <span aria-hidden className={cn("absolute top-7 bottom-0 left-3.5 w-0.5", step.state === "done" ? "bg-brand" : "bg-border")} />}
            <span
              aria-hidden
              className={cn(
                "relative flex size-7 shrink-0 items-center justify-center rounded-full",
                step.problem ? "bg-danger-soft text-danger" : step.state === "done" ? "bg-brand text-brand-fg" : step.state === "current" ? "bg-brand-soft text-brand-soft-fg" : "bg-surface-2 text-subtle",
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className={cn("block text-sm font-medium", step.state === "upcoming" ? "text-muted" : "text-fg")}>{t(`orders.visits.steps.${step.key}`)}</span>
              {step.at && <span className="block text-xs text-muted tabular-nums">{formatIST(step.at)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Rating({ visit }: { visit: Visit }) {
  if (visit.rating) {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-1 text-sm font-medium text-fg">
          <span aria-hidden className="flex text-accent">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={cn("size-4", n <= visit.rating!.rating ? "fill-current" : "text-border-strong")} />
            ))}
          </span>
          {t(visit.ratedByYou ? "orders.rating.yours" : "orders.rating.household", { n: visit.rating.rating })}
        </p>
        {visit.rating.comment && <p className="text-sm text-muted">“{visit.rating.comment}”</p>}
      </div>
    );
  }
  if (!visit.canRate) return null;
  const text = messages().orders.rating;
  return (
    <div className="space-y-2 rounded-control bg-surface-2 p-3">
      <h3 className="font-semibold text-fg">{text.title}</h3>
      <RatingForm visitId={visit.id} text={{ title: text.title, label: text.label, star: text.star, words: text.words, comment: text.comment, commentPlaceholder: text.commentPlaceholder, submit: text.submit }} />
    </div>
  );
}

function Complaint({ visit }: { visit: Visit }) {
  if (visit.issue) {
    return (
      <div className="space-y-1 rounded-control border border-border p-3 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-fg">
          <MessageSquareWarning aria-hidden className="size-4 text-warning" />
          {t("orders.issue.title")}
          <Badge tone={visit.issue.status === "OPEN" ? "warning" : "neutral"}>{t(`orders.issue.status.${visit.issue.status}`)}</Badge>
        </p>
        <p className="text-muted">{t(`orders.issue.kind.${visit.issue.kind}`)}: “{visit.issue.note}”</p>
        {visit.issue.resolution && <p className="text-fg">{t("orders.issue.resolution", { text: visit.issue.resolution })}</p>}
      </div>
    );
  }
  if (visit.report) {
    const dispute = visit.report.kind === "NO_ACCESS_DISPUTE";
    return (
      <div className="space-y-1.5">
        <Sheet
          title={t(dispute ? "orders.report.disputeTitle" : "orders.report.title")}
          trigger={
            <>
              <MessageSquareWarning aria-hidden className="size-4" />
              {t(dispute ? "orders.report.disputeButton" : "orders.report.button")}
            </>
          }
          triggerClassName={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          <ActionForm action={reportIssueAction} className="space-y-4">
            <p className="text-sm text-muted">{t(dispute ? "orders.report.disputeBody" : "orders.report.body")}</p>
            <input type="hidden" name="visitId" value={visit.id} />
            <Field id={`issue-note-${visit.id}`} label={t("orders.report.note")}>
              {(aria) => <Textarea {...aria} name="note" rows={4} required minLength={MIN_NOTE} maxLength={MAX_NOTE} placeholder={t("orders.report.notePlaceholder")} />}
            </Field>
            <SubmitButton block>{t("orders.report.submit")}</SubmitButton>
          </ActionForm>
        </Sheet>
        <p className="text-xs text-muted">{t("orders.report.until", { when: formatIST(visit.report.deadline) })}</p>
      </div>
    );
  }
  if (visit.reportClosedAt) return <p className="text-xs text-muted">{t("orders.report.closed", { when: formatIST(visit.reportClosedAt) })}</p>;
  return null;
}

/** One visit to the flat: when, who, its progress, the code to share, and rating or complaint. */
export function VisitCard({ visit, title }: { visit: Visit; title: string }) {
  return (
    <Card as="article" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="font-semibold text-fg">
            {title}
            {visit.kind === "REVISIT" && (
              <Badge tone="accent" className="ml-2 align-middle">
                {t("orders.visits.revisit")}
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted">
            {formatIST(visit.startsAt)} – {formatIST(visit.endsAt, "time")}
          </p>
          {visit.technicianName && (
            <p className="flex items-center gap-1 text-sm text-muted">
              <UserRound aria-hidden className="size-3.5" />
              {t("orders.visits.technician", { name: visit.technicianName })}
            </p>
          )}
        </div>
        <Badge tone={STATUS_TONE[visit.status]}>{t(`visitStatus.${visit.status}`)}</Badge>
      </header>

      {visit.completionCode && (
        <div className="flex flex-wrap items-center gap-2 rounded-control bg-accent-soft px-3 py-2">
          <KeyRound aria-hidden className="size-4 text-accent-soft-fg" />
          <span className="font-semibold text-accent-soft-fg tabular-nums">{t("orders.visits.code", { code: visit.completionCode })}</span>
          <span className="text-xs text-accent-soft-fg">{t("orders.visits.codeHint")}</span>
        </div>
      )}

      <Timeline visit={visit} />
      {visit.status === "CANCELLED" && visit.cancelReason && <p className="text-sm text-muted">{t("orders.visits.cancelReason", { reason: visit.cancelReason })}</p>}
      <Rating visit={visit} />
      <Complaint visit={visit} />
    </Card>
  );
}

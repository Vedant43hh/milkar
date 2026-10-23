import { Ban, Check, CircleDot, KeyRound, MessageSquareText, MessageSquareWarning, Package, Star, UserRound, X } from "lucide-react";
import Image from "next/image";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Field, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import { messages, t } from "@/i18n";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { declinePartsAction, reportIssueAction } from "@/server/actions/orders";
import type { RoundHistory } from "@/server/history";
import { MAX_NOTE, MIN_NOTE } from "@/server/visit-feedback";
import { ApprovePartsButton } from "./parts-approval";
import { ProblemForm } from "./problem-form";
import { problemFormText } from "./problem-text";
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

/** Repair visits: what's wrong, editable until the technician sets out. */
function Problem({ visit, roundId }: { visit: Visit; roundId: string }) {
  if (!visit.bill) return null;
  const photo = visit.booking.photo;
  if (visit.problemEditable) {
    const text = messages().problem;
    return (
      <div className="space-y-2 rounded-control bg-surface-2 p-3">
        <h4 className="font-semibold text-fg">{text.title}</h4>
        <p className="text-sm text-muted">{text.intro}</p>
        <ProblemForm
          roundId={roundId}
          note={visit.booking.problemNote ?? ""}
          photo={photo ? { url: `/api/photos/${photo.id}`, width: photo.width, height: photo.height } : null}
          text={problemFormText()}
        />
      </div>
    );
  }
  if (!visit.booking.problemNote && !photo) return null;
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-start gap-2 text-fg">
        <MessageSquareText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        {visit.booking.problemNote}
      </p>
      {photo && (
        <Image src={`/api/photos/${photo.id}`} alt={t("problem.preview")} width={photo.width} height={photo.height} unoptimized className="max-h-40 w-auto rounded-control border border-border object-contain" />
      )}
    </div>
  );
}

const PARTS_TONE = { PENDING: "accent", APPROVED: "success", DECLINED: "neutral", REFUNDED: "neutral" } as const;

/** Parts the technician asked for, the one waiting for an answer, and the repair bill. */
function Parts({ visit }: { visit: Visit }) {
  const bill = visit.bill;
  if (!bill) return null;
  return (
    <div className="space-y-3">
      {visit.partsRequests.map((request) => (
        <div key={request.id} className={cn("space-y-2 rounded-control border p-3 text-sm", request.status === "PENDING" ? "border-accent bg-accent-soft/40" : "border-border")}>
          <p className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-fg">
              <Package aria-hidden className="size-4 text-muted" />
              {t("parts.title")}
            </span>
            <Badge tone={PARTS_TONE[request.status]}>{t(`parts.status.${request.status}`)}</Badge>
          </p>
          <ul className="space-y-0.5">
            {request.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-3 tabular-nums">
                <span className="text-fg">{t("parts.partsLine", { name: item.name, qty: item.qty })}</span>
                <span className="text-muted">{formatINR(item.qty * item.unitPaise)}</span>
              </li>
            ))}
          </ul>
          {request.status === "PENDING" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <ApprovePartsButton requestId={request.id} label={t("parts.approve", { amount: formatINR(request.totalPaise) })} />
              <Sheet
                title={t("parts.declineTitle")}
                trigger={
                  <>
                    <X aria-hidden className="size-4" />
                    {t("parts.decline")}
                  </>
                }
                triggerClassName={buttonClasses({ variant: "secondary" })}
              >
                <ActionForm action={declinePartsAction} className="space-y-4">
                  <p className="text-sm text-muted">{t("parts.declineBody")}</p>
                  <input type="hidden" name="requestId" value={request.id} />
                  <SubmitButton block variant="danger">
                    {t("parts.declineConfirm")}
                  </SubmitButton>
                </ActionForm>
              </Sheet>
            </div>
          )}
        </div>
      ))}
      <div className="space-y-1 rounded-control bg-surface-2 p-3 text-sm">
        <h4 className="font-semibold text-fg">{t("parts.bill")}</h4>
        <dl className="space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t("parts.visitCharge")}</dt>
            <dd className="text-fg tabular-nums">{formatINR(bill.visitPaise)}</dd>
          </div>
          {bill.partsPaise > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("parts.partsTotal")}</dt>
              <dd className="text-fg tabular-nums">{formatINR(bill.partsPaise)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 font-semibold">
            <dt className="text-fg">{t("parts.total")}</dt>
            <dd className="text-fg tabular-nums">{formatINR(bill.totalPaise)}</dd>
          </div>
        </dl>
        {bill.pendingPaise > 0 && <p className="text-xs text-accent-soft-fg">{t("parts.pending", { amount: formatINR(bill.pendingPaise) })}</p>}
        <p className="text-xs text-muted">{t("parts.atCost")}</p>
      </div>
    </div>
  );
}

/** One visit to the flat: when, who, its progress, the code to share, and rating or complaint. */
export function VisitCard({ visit, title, roundId }: { visit: Visit; title: string; roundId: string }) {
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

      <Problem visit={visit} roundId={roundId} />
      <Timeline visit={visit} />
      {visit.status === "CANCELLED" && visit.cancelReason && <p className="text-sm text-muted">{t("orders.visits.cancelReason", { reason: visit.cancelReason })}</p>}
      <Parts visit={visit} />
      <Rating visit={visit} />
      <Complaint visit={visit} />
    </Card>
  );
}

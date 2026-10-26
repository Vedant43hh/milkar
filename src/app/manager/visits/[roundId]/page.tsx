import { Ban, ChevronLeft, CircleCheck, KeyRound, MessageSquareText, MessageSquareWarning, Package, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/manager/confirm-action";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Badge, type Tone } from "@/components/ui/badge";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatIST } from "@/lib/time";
import { cancelVisitAction, confirmVisitAction } from "@/server/actions/manager";
import { actorOf } from "@/server/rounds";
import { getVisitBoard, type VisitBoard } from "@/server/visit-board";

export const metadata: Metadata = { title: t("visitBoard.title") };

const TONE: Record<string, Tone> = { SCHEDULED: "neutral", ON_THE_WAY: "brand", IN_PROGRESS: "accent", COMPLETED: "success", NO_ACCESS: "danger", CANCELLED: "neutral" };

export default function VisitBoardPage({ params }: PageProps<"/manager/visits/[roundId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Board params={params} />
    </Suspense>
  );
}

type Visit = VisitBoard["slots"][number]["visits"][number];

function VisitRow({ visit, unitLabel }: { visit: Visit; unitLabel: string }) {
  const flat = `${unitLabel} ${visit.flat.tower}-${visit.flat.number}`;
  const active = visit.status === "SCHEDULED" || visit.status === "ON_THE_WAY" || visit.status === "IN_PROGRESS";
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-fg">{flat}</span>
        <Badge tone={TONE[visit.status]}>{t(`visitStatus.${visit.status}`)}</Badge>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <UserRound aria-hidden className="size-4" />
        {visit.technicianName ? t("visitBoard.technician", { name: visit.technicianName }) : t("visitBoard.unassigned")}
      </p>
      {visit.booking.problemNote && (
        <p className="flex items-start gap-1.5 text-sm text-fg">
          <MessageSquareText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
          {visit.booking.problemNote}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {visit.partsWaiting && (
          <Badge tone="accent" icon={<Package aria-hidden className="size-3.5" />}>
            {t("visitBoard.partsWaiting")}
          </Badge>
        )}
        {visit.codeLocked && visit.status === "IN_PROGRESS" && (
          <Badge tone="warning" icon={<KeyRound aria-hidden className="size-3.5" />}>
            {t("visitBoard.codeLocked")}
          </Badge>
        )}
        {visit.issue && (
          <Badge tone="warning" icon={<MessageSquareWarning aria-hidden className="size-3.5" />}>
            {t("visitBoard.complaint")}: {t(`issues.status.${visit.issue.status}`)}
          </Badge>
        )}
      </div>
      {visit.status === "CANCELLED" && visit.cancelReason && <p className="text-sm text-muted">{t("orders.visits.cancelReason", { reason: visit.cancelReason })}</p>}
      {active && (
        <div className="flex flex-wrap gap-2">
          {visit.codeLocked && visit.status === "IN_PROGRESS" && !visit.partsWaiting && (
            <ConfirmAction
              action={confirmVisitAction}
              fields={{ visitId: visit.id }}
              trigger={
                <>
                  <CircleCheck aria-hidden className="size-4" />
                  {t("visitBoard.confirm")}
                  <span className="sr-only"> {flat}</span>
                </>
              }
              title={t("visitBoard.confirm")}
              confirm={t("visitBoard.confirm")}
            />
          )}
          <ConfirmAction
            action={cancelVisitAction}
            fields={{ visitId: visit.id }}
            trigger={
              <>
                <Ban aria-hidden className="size-4" />
                {t("visitBoard.cancel")}
                <span className="sr-only"> {flat}</span>
              </>
            }
            triggerVariant="ghost"
            title={t("visitBoard.cancelTitle")}
            body={t("visitBoard.cancelBody")}
            confirm={t("visitBoard.cancelConfirm")}
            danger
          >
            <Field id={`cancel-reason-${visit.id}`} label={t("visitBoard.cancelReason")}>
              {(aria) => <Textarea {...aria} name="reason" rows={2} maxLength={200} required minLength={3} />}
            </Field>
          </ConfirmAction>
        </div>
      )}
    </li>
  );
}

/** One Service Day's visits, slot by slot, refreshing on its own while visits are going on. */
async function Board({ params }: { params: PageProps<"/manager/visits/[roundId]">["params"] }) {
  const user = await requirePortal("manager");
  const { roundId } = await params;
  const board = await getVisitBoard(actorOf(user), roundId);
  if (!board) notFound();
  const { round, slots, revisits, counts } = board;
  const live = counts.done + counts.problems < counts.total;

  return (
    <div className="space-y-4">
      {live && <AutoRefresh seconds={30} />}
      <Link href="/manager/visits" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("visitBoard.back")}
      </Link>
      <PageHeader
        title={round.title}
        subtitle={[t("visitBoard.summary", { done: counts.done, total: counts.total }), counts.problems > 0 ? t("visitBoard.problems", { n: counts.problems }) : null].filter(Boolean).join(" · ")}
      />
      {slots.map((slot) => {
        const id = `slot-${slot.id}`;
        return (
          <section key={slot.id} aria-labelledby={id}>
            <SectionTitle>
              <span id={id}>
                {formatIST(slot.startsAt)} – {formatIST(slot.endsAt, "time")}
              </span>
            </SectionTitle>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {slot.visits.map((visit) => (
                <VisitRow key={visit.id} visit={visit} unitLabel={round.unitLabel} />
              ))}
            </ul>
          </section>
        );
      })}
      {revisits.length > 0 && (
        <section aria-labelledby="revisits">
          <SectionTitle>
            <span id="revisits">{t("visitBoard.revisits")}</span>
          </SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {revisits.map((visit) => (
              <VisitRow key={visit.id} visit={visit} unitLabel={round.unitLabel} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

import { ChevronLeft, Clock, House, Undo2, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VisitActions } from "@/components/tech/visit-actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { returnPartsAction } from "@/server/actions/tech";
import { technicianVisit } from "@/server/technician";

export const metadata: Metadata = { title: t("techVisit.title") };

const STATUS_TONE: Record<string, Tone> = { SCHEDULED: "neutral", ON_THE_WAY: "brand", IN_PROGRESS: "accent", COMPLETED: "success", NO_ACCESS: "danger", CANCELLED: "neutral" };
const PARTS_TONE: Record<string, Tone> = { PENDING: "accent", APPROVED: "success", DECLINED: "neutral", REFUNDED: "neutral" };

export default function TechnicianVisitPage({ params }: PageProps<"/tech/visits/[visitId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <VisitView params={params} />
    </Suspense>
  );
}

/** One visit for the technician doing it: where, when, what's wrong, the parts, and the next step. */
async function VisitView({ params }: { params: PageProps<"/tech/visits/[visitId]">["params"] }) {
  const user = await requirePortal("tech");
  const { visitId } = await params;
  const visit = await technicianVisit(user.id, visitId);
  if (!visit) notFound();
  const photo = visit.booking.photo;

  return (
    <div className="space-y-4 pb-24">
      {/* While the resident decides on parts, check back by itself. */}
      {visit.actions.waiting && <AutoRefresh seconds={5} />}
      <Link href="/tech" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("techVisit.back")}
      </Link>
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {t("techVisit.flat", { unit: visit.flat.community.unitLabel, flat: `${visit.flat.tower}-${visit.flat.number}` })}
          </h1>
          <Badge tone={STATUS_TONE[visit.status]}>{t(`visitStatus.${visit.status}`)}</Badge>
        </div>
        <p className="flex items-center gap-2 text-base text-fg tabular-nums">
          <Clock aria-hidden className="size-5 text-brand" />
          {formatIST(visit.startsAt)} – {formatIST(visit.endsAt, "time")}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted">
          <House aria-hidden className="size-4" />
          {visit.flat.community.name}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Wrench aria-hidden className="size-4" />
          {visit.round.service?.name ?? visit.round.title}
          {visit.kind === "REVISIT" && <Badge tone="accent">{t("tech.revisit")}</Badge>}
        </p>
      </header>

      <Card labelledBy="problem-title">
        <CardHeader titleId="problem-title" title={t("techVisit.problem")} />
        <p className="text-base text-fg">{visit.booking.problemNote ?? <span className="text-muted">{t("techVisit.noProblem")}</span>}</p>
        {photo && (
          <a href={`/api/photos/${photo.id}`} target="_blank" rel="noreferrer" className="mt-3 block" aria-label={t("techVisit.openPhoto")}>
            <Image src={`/api/photos/${photo.id}`} alt={t("techVisit.photo")} width={photo.width} height={photo.height} unoptimized className="max-h-64 w-auto rounded-control border border-border object-contain" />
          </a>
        )}
      </Card>

      <Card labelledBy="parts-title">
        <CardHeader titleId="parts-title" title={t("techVisit.parts.title")} />
        {visit.partsRequests.length === 0 ? (
          <p className="text-sm text-muted">{t("techVisit.parts.none")}</p>
        ) : (
          <ul className="space-y-3">
            {visit.partsRequests.map((request) => (
              <li key={request.id} className="space-y-1.5 rounded-control border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg tabular-nums">{formatINR(request.totalPaise)}</span>
                  <Badge tone={PARTS_TONE[request.status]}>{t(`techVisit.parts.status.${request.status}`)}</Badge>
                </div>
                <ul className="text-muted">
                  {request.items.map((item, i) => (
                    <li key={i} className="tabular-nums">
                      {item.name} × {item.qty} · {formatINR(item.unitPaise)}
                    </li>
                  ))}
                </ul>
                {request.status === "APPROVED" && visit.status === "IN_PROGRESS" && (
                  <ActionForm action={returnPartsAction}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <SubmitButton size="sm" variant="ghost" icon={<Undo2 aria-hidden className="size-4" />}>
                      {t("techVisit.parts.returnUnused")}
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 rounded-card border border-border bg-surface/95 p-3 shadow-raised backdrop-blur">
        <VisitActions visit={visit} />
      </div>
    </div>
  );
}

import { ChevronRight, Clock, House, ImageIcon, MessageSquareText, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n";
import { formatIST } from "@/lib/time";
import type { TechnicianVisit } from "@/server/technician";
import { Badge, type Tone } from "../ui/badge";

const STATUS_TONE: Record<TechnicianVisit["status"], Tone> = {
  SCHEDULED: "neutral",
  ON_THE_WAY: "brand",
  IN_PROGRESS: "accent",
  COMPLETED: "success",
  NO_ACCESS: "danger",
  CANCELLED: "neutral",
};

/** A technician's visits as big, easy-to-tap cards: time, flat, job and what's wrong. Each opens the visit. */
export function VisitList({ visits, empty, showDay = false }: { visits: TechnicianVisit[]; empty: ReactNode; showDay?: boolean }) {
  if (visits.length === 0) return <>{empty}</>;
  return (
    <ol className="space-y-3">
      {visits.map((v) => {
        const waiting = v.partsRequests.some((r) => r.status === "PENDING");
        return (
          <li key={v.id}>
            <Link href={`/tech/visits/${v.id}`} className="block rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-lg font-semibold text-fg tabular-nums">
                  <Clock aria-hidden className="size-5 text-brand" />
                  {showDay ? formatIST(v.startsAt) : `${formatIST(v.startsAt, "time")} – ${formatIST(v.endsAt, "time")}`}
                </p>
                <Badge tone={STATUS_TONE[v.status]}>{t(`visitStatus.${v.status}`)}</Badge>
              </div>
              <p className="mt-2 flex items-center gap-2 text-base text-fg">
                <House aria-hidden className="size-5 shrink-0 text-muted" />
                {v.flat.community.unitLabel} {v.flat.tower}-{v.flat.number} · {v.flat.community.name}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                <Wrench aria-hidden className="size-4 shrink-0" />
                {v.round.service?.name ?? v.round.title}
                {v.kind === "REVISIT" && <Badge tone="accent">{t("tech.revisit")}</Badge>}
              </p>
              {v.booking.problemNote && (
                <p className="mt-2 flex items-start gap-2 text-sm text-fg">
                  <MessageSquareText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  <span className="line-clamp-2">{v.booking.problemNote}</span>
                  {v.booking.photo && (
                    <>
                      <ImageIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                      <span className="sr-only">{t("techVisit.photo")}</span>
                    </>
                  )}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                {waiting ? <Badge tone="accent">{t("techVisit.parts.status.PENDING")}</Badge> : <span />}
                <ChevronRight aria-hidden className="size-5 text-subtle" />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n";
import { formatIST } from "@/lib/time";
import type { TechnicianVisit } from "@/server/technician";
import { Badge } from "../ui/badge";
import { VisitStatusBadge } from "../visits/visit-status-badge";

/** A technician's visits as big, easy-to-tap cards: time, flat, job and what's wrong. Each opens the visit. */
export function VisitList({ visits, empty, showDay = false }: { visits: TechnicianVisit[]; empty: ReactNode; showDay?: boolean }) {
  if (visits.length === 0) return <>{empty}</>;
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {visits.map((v) => {
        const waiting = v.partsRequests.some((r) => r.status === "PENDING");
        return (
          <li key={v.id}>
            <Link href={`/tech/visits/${v.id}`} className="block p-4 transition-colors hover:bg-surface-hover">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-base font-semibold text-fg tabular-nums">
                  {showDay ? formatIST(v.startsAt) : `${formatIST(v.startsAt, "time")} – ${formatIST(v.endsAt, "time")}`}
                </p>
                <VisitStatusBadge status={v.status} />
              </div>
              <p className="mt-2 flex items-center gap-2 text-base text-fg">
                {v.flat.community.unitLabel} {v.flat.tower}-{v.flat.number} · {v.flat.community.name}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                {v.round.service?.name ?? v.round.title}
                {v.kind === "REVISIT" && <Badge tone="info">{t("tech.revisit")}</Badge>}
              </p>
              {v.booking.problemNote && (
                <p className="mt-2 flex items-start gap-2 text-sm text-fg">
                  <span className="line-clamp-2">{v.booking.problemNote}</span>
                  {v.booking.photo && (
                    <>
                      <span className="sr-only">{t("techVisit.photo")}</span>
                    </>
                  )}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                {waiting ? <Badge tone="warning">{t("techVisit.parts.status.PENDING")}</Badge> : <span />}
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

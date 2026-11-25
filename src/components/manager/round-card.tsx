import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, type Tone } from "@/components/ui/badge";
import { Countdown } from "@/components/ui/countdown";
import { TierMeter } from "@/components/ui/progress";
import { t } from "@/i18n";
import { formatINR } from "@/lib/pricing/money";
import { displayStatus, type DisplayStatus } from "@/lib/rounds";
import { formatIST } from "@/lib/time";
import type { ManagerRound } from "@/server/rounds";
import { offeringName, offeringWords, statsOf } from "./round-view";

export const STATUS_TONE: Record<DisplayStatus, Tone> = {
  OPEN: "info",
  CLOSED: "warning",
  FINALIZING: "warning",
  FINALIZED: "success",
  DROPPED: "neutral",
  COMPLETED: "neutral",
  CANCELLED: "danger",
};

export function RoundStatusBadges({ kind, status }: { kind: "GROCERY" | "SERVICE"; status: DisplayStatus }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge>{t(`roundKind.${kind}`)}</Badge>
      <Badge tone={STATUS_TONE[status]}>{t(`roundStatus.${status}`)}</Badge>
    </span>
  );
}

/** A round at a glance: status, countdown, totals, and the nearest price unlock. */
export function RoundCard({ round, unitLabel, now }: { round: ManagerRound; unitLabel: string; now: Date }) {
  const status = displayStatus(round, now);
  const stats = statsOf(round);
  const lead = stats.closeToUnlock[0] ?? stats.belowMinimum[0] ?? null;
  const leadOffering = lead ? round.offerings.find((o) => o.id === lead.id) : undefined;

  return (
    <Link
      href={`/manager/rounds/${round.id}`}
      className="group block p-4 transition-colors hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <RoundStatusBadges kind={round.kind} status={status} />
          <h3 className="font-semibold text-fg">{round.title}</h3>
          <p className="text-sm">
            {status === "OPEN" ? <Countdown to={round.cutoffAt.toISOString()} /> : <span className="text-muted">{formatIST(round.cutoffAt)}</span>}
          </p>
        </div>
        <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
      </div>
      <p className="mt-2 text-sm text-muted tabular-nums">
        {t("manager.stats", { flats: stats.flats, units: stats.units, collected: formatINR(stats.collectedPaise) })}
      </p>
      {status === "OPEN" && lead && leadOffering && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 truncate text-sm font-medium text-fg">{round.kind === "SERVICE" ? round.service?.name : offeringName(leadOffering)}</p>
          <TierMeter meter={lead.meter} basisWords={offeringWords(leadOffering, unitLabel)} compact />
        </div>
      )}
    </Link>
  );
}

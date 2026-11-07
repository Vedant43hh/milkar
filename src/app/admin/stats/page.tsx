import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { averageRating, REFUND_TYPES, type VerticalStats } from "@/lib/admin/stats";
import { formatINR } from "@/lib/pricing/money";
import { adminStats } from "@/server/admin";

export const metadata: Metadata = { title: t("adminStats.title") };

export default function StatsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={4} />}>
      <Stats />
    </Suspense>
  );
}

const count = new Intl.NumberFormat("en-IN");

function Figures({ s }: { s: VerticalStats }) {
  const rating = averageRating(s);
  const rows: [string, string][] = [
    [t("adminStats.rounds"), count.format(s.rounds)],
    [t("adminStats.gmv"), formatINR(s.gmvPaise)],
    [t("adminStats.saved"), formatINR(s.savedPaise)],
    [t("adminStats.margin"), formatINR(s.marginPaise)],
    [t("adminStats.absorbed"), formatINR(s.absorbedPaise)],
    [t("adminStats.refunds"), formatINR(s.refundsPaise)],
    [t("adminStats.visits"), count.format(s.visitsCompleted)],
    [t("adminStats.rating"), rating === null ? t("adminStats.noRating") : `${rating} ★ (${s.ratingCount})`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted">{label}</dt>
          <dd className="font-semibold text-fg tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The platform's numbers by kind of group buy, refunds by reason, polls and impact. */
async function Stats() {
  await requirePortal("admin");
  const { stats, impact } = await adminStats();
  const pct = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 0 });
  return (
    <div className="space-y-5">
      <PageHeader title={t("adminStats.title")} subtitle={t("adminStats.intro")} />
      <Card labelledBy="stats-total">
        <CardHeader titleId="stats-total" title={t("adminStats.total")} />
        <Figures s={stats.total} />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {stats.verticals.map((v) => (
          <Card key={v.vertical} labelledBy={`stats-${v.vertical}`}>
            <CardHeader titleId={`stats-${v.vertical}`} title={t(`buys.categories.${v.vertical}.name`)} />
            <Figures s={v} />
          </Card>
        ))}
      </div>
      <Card labelledBy="stats-refunds">
        <CardHeader titleId="stats-refunds" title={t("adminStats.refundsTitle")} />
        <dl className="space-y-1.5 text-sm">
          {REFUND_TYPES.map((type) => (
            <div key={type} className="flex justify-between gap-3">
              <dt className="text-muted">{t(`adminStats.refundType.${type}`)}</dt>
              <dd className="font-medium text-fg tabular-nums">{formatINR(stats.refundsByType[type])}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card labelledBy="stats-polls">
          <CardHeader titleId="stats-polls" title={t("adminStats.pollsTitle")} />
          <p className="text-sm text-fg">{t("adminStats.pollsRate", { converted: stats.polls.converted, total: stats.polls.total, rate: pct.format(stats.polls.rate) })}</p>
        </Card>
        <Card labelledBy="stats-impact">
          <CardHeader titleId="stats-impact" title={t("adminStats.impactTitle")} />
          <dl className="grid grid-cols-3 gap-3 text-sm">
            {(
              [
                [t("adminStats.tripsAvoided"), count.format(impact.trips.avoided)],
                [t("adminStats.km"), count.format(impact.km)],
                [t("adminStats.co2"), count.format(impact.kgCo2)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold text-fg tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

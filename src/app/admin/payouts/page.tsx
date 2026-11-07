import { IndianRupee } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge, PayoutBreakdown } from "@/components/vendor/payout";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { markPaidAction } from "@/server/actions/admin";
import { listPayouts } from "@/server/admin";

export const metadata: Metadata = { title: t("adminPayouts.title") };

export default function PayoutsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Payouts />
    </Suspense>
  );
}

type Row = Awaited<ReturnType<typeof listPayouts>>["ready"][number];

function PayoutCard({ row }: { row: Row }) {
  const titleId = `payout-${row.id}`;
  return (
    <Card as="li" labelledBy={titleId}>
      <CardHeader
        titleId={titleId}
        title={`${row.vendor.name} · ${t("vendorOrders.number", { n: row.number })}`}
        subtitle={`${row.round.title} · ${row.round.community.name}`}
        action={<OrderStatusBadge status={row.status} />}
      />
      <PayoutBreakdown payout={row.payout} />
      {row.status === "PAID" && row.paidAt && <p className="mt-2 text-sm text-muted">{t("adminPayouts.paidOn", { when: formatIST(row.paidAt) })}</p>}
      {row.blocker && <p className="mt-2 text-sm text-muted">{t(`adminPayouts.blocker.${row.blocker}`)}</p>}
      {row.status !== "PAID" && !row.blocker && (
        <div className="mt-3">
          <ConfirmAction
            action={markPaidAction}
            fields={{ orderId: row.id }}
            trigger={t("adminPayouts.markPaid")}
            triggerVariant="primary"
            title={t("adminPayouts.markTitle", { vendor: row.vendor.name })}
            body={t("adminPayouts.markBody", { amount: formatINR(row.payout.payoutPaise), round: row.round.title })}
            confirm={t("adminPayouts.markPaid")}
          />
        </div>
      )}
    </Card>
  );
}

async function Payouts() {
  await requirePortal("admin");
  const { ready, waiting, paid } = await listPayouts(new Date());
  const section = (id: string, title: string, rows: Row[]) =>
    rows.length > 0 && (
      <section aria-labelledby={id}>
        <SectionTitle>
          <span id={id}>{title}</span>
        </SectionTitle>
        <ul className="space-y-3">
          {rows.map((row) => (
            <PayoutCard key={row.id} row={row} />
          ))}
        </ul>
      </section>
    );
  return (
    <div className="space-y-6">
      <PageHeader title={t("adminPayouts.title")} subtitle={t("adminPayouts.intro")} />
      {ready.length + waiting.length + paid.length === 0 && <EmptyState icon={<IndianRupee aria-hidden className="size-6" />} title={t("adminPayouts.none")} body={t("adminPayouts.noneBody")} />}
      {section("payouts-ready", t("adminPayouts.ready"), ready)}
      {section("payouts-waiting", t("adminPayouts.waiting"), waiting)}
      {section("payouts-paid", t("adminPayouts.paid"), paid)}
    </div>
  );
}

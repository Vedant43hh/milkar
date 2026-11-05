import { IndianRupee } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, Stat } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { whenText } from "@/components/vendor/order-text";
import { OrderStatusBadge, PayoutBreakdown } from "@/components/vendor/payout";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { vendorEarnings } from "@/server/vendor-orders";

export const metadata: Metadata = { title: t("vendorEarnings.title") };

export default function EarningsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Earnings />
    </Suspense>
  );
}

/** Per order: the total as issued, plus every change, gives the payout. */
async function Earnings() {
  const user = await requirePortal("vendor");
  const { orders, summary, thisMonthPaise } = await vendorEarnings(user.vendor.id, new Date());
  return (
    <div className="space-y-5">
      <PageHeader title={t("vendorEarnings.title")} subtitle={t("vendorEarnings.intro")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat tone="brand" label={t("vendorHome.owed")} value={formatINR(summary.owedPaise)} icon={<IndianRupee aria-hidden className="size-5" />} />
        <Stat label={t("vendorHome.paid")} value={formatINR(summary.paidPaise)} />
        <Stat label={t("vendorHome.thisMonth")} value={formatINR(thisMonthPaise)} />
      </div>
      {orders.length === 0 ? (
        <EmptyState icon={<IndianRupee aria-hidden className="size-6" />} title={t("vendorEarnings.none")} body={t("vendorEarnings.noneBody")} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Card as="article" labelledBy={`earning-${o.id}`}>
                <CardHeader
                  titleId={`earning-${o.id}`}
                  title={`${t("vendorOrders.number", { n: o.number })} · ${o.round.title}`}
                  subtitle={`${o.round.community.name} · ${whenText(o.round)}`}
                  action={<OrderStatusBadge status={o.status} />}
                />
                <PayoutBreakdown payout={o.payout} />
                <Link href={`/vendor/orders/${o.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand">
                  {t("vendorEarnings.viewOrder")}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

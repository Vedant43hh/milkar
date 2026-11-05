import { ArrowRight, CalendarClock, IndianRupee, Package, Star, Truck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, Stat } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/components/vendor/payout";
import { Verification } from "@/components/vendor/verification";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { vendorStanding } from "@/server/registration";
import { getVendorHome } from "@/server/vendor-home";

export default function VendorPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <VendorHome />
    </Suspense>
  );
}

const linkClass = "inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand";

async function VendorHome() {
  const user = await requirePortal("vendor");
  const now = new Date();
  const [home, standing] = await Promise.all([getVendorHome(user.vendor.id, now), vendorStanding(user.vendor.id)]);
  const { today, earnings, vendor } = home;
  const nothing = today.visits === 0 && home.toAcknowledge.length === 0 && home.deliveries.length === 0 && earnings.owedPaise === 0 && earnings.paidPaise === 0;
  const rating = vendor.ratingCount > 0 ? (vendor.ratingSum / vendor.ratingCount).toFixed(1) : null;

  return (
    <div className="space-y-5">
      <PageHeader title={`${t("areas.vendorTitle")} · ${vendor.name}`} subtitle={t("areas.signedInAs", { name: user.name ?? user.phone, role: t(`roles.${user.role}`) })} />
      {vendor.verificationStatus !== "VERIFIED" && <Verification vendor={standing} />}

      {today.visits > 0 && (
        <Card labelledBy="today-title">
          <CardHeader titleId="today-title" title={t("vendorHome.todayTitle")} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("vendorHome.visitsToday")} value={String(today.visits)} hint={t("vendorHome.doneToday", { done: today.done, total: today.visits })} icon={<CalendarClock aria-hidden className="size-5" />} />
            {today.unassigned > 0 && <Stat tone="accent" label={t("vendorHome.unassigned")} value={String(today.unassigned)} />}
          </div>
          <Link href="/vendor/schedule" className={linkClass}>
            {t("vendorHome.openSchedule")}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Card>
      )}

      {home.toAcknowledge.length > 0 && (
        <Card labelledBy="ack-title">
          <CardHeader titleId="ack-title" title={t("vendorHome.acknowledgeTitle")} subtitle={t("vendorHome.acknowledgeBody")} />
          <ul className="divide-y divide-border">
            {home.toAcknowledge.map((o) => (
              <li key={o.id}>
                <Link href={`/vendor/orders/${o.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">
                      {t("vendorOrders.number", { n: o.number })} · {o.round.title}
                    </span>
                    <span className="block text-muted">{o.round.community.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    <span className="font-semibold text-fg tabular-nums">{formatINR(o.totalPaise)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {home.deliveries.length > 0 && (
        <Card labelledBy="deliveries-title">
          <CardHeader titleId="deliveries-title" title={t("vendorHome.deliveriesTitle")} />
          <ul className="divide-y divide-border">
            {home.deliveries.map((o) => (
              <li key={o.id}>
                <Link href={`/vendor/orders/${o.id}`} className="flex min-h-11 items-center gap-3 py-2.5 text-sm">
                  <Truck aria-hidden className="size-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">
                      {o.round.title} · {o.round.community.name}
                    </span>
                    <span className="block text-muted">{t("vendorHome.deliverBy", { when: formatIST(o.round.deliveryAt) })}</span>
                  </span>
                  <OrderStatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card labelledBy="earnings-title">
        <CardHeader titleId="earnings-title" title={t("vendorHome.earningsTitle")} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat tone="brand" label={t("vendorHome.owed")} value={formatINR(earnings.owedPaise)} icon={<IndianRupee aria-hidden className="size-5" />} />
          <Stat label={t("vendorHome.paid")} value={formatINR(earnings.paidPaise)} />
          <Stat label={t("vendorHome.thisMonth")} value={formatINR(earnings.thisMonthPaise)} />
        </div>
        <Link href="/vendor/earnings" className={linkClass}>
          {t("vendorHome.allEarnings")}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Card>

      <Card labelledBy="rating-title">
        <CardHeader titleId="rating-title" title={t("vendorHome.ratingTitle")} />
        {rating ? (
          <p className="flex items-center gap-2 text-fg">
            <Star aria-hidden className="size-5 fill-current text-accent" />
            <span className="text-2xl font-semibold tabular-nums">{t("vendorHome.rating", { rating })}</span>
            <span className="text-sm text-muted">{t("vendorHome.ratingCount", { n: vendor.ratingCount })}</span>
          </p>
        ) : (
          <p className="text-sm text-muted">{t("vendorHome.noRatings")}</p>
        )}
      </Card>

      {nothing && <EmptyState icon={<Package aria-hidden className="size-6" />} title={t("vendorHome.nothingYet")} body={t("vendorHome.nothingYetBody")} />}
    </div>
  );
}

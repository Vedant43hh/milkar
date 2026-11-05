import { Package } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { whenText } from "@/components/vendor/order-text";
import { OrderStatusBadge } from "@/components/vendor/payout";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import type { PayoutStatus } from "@/lib/vendor/payout";
import { listVendorOrders } from "@/server/vendor-orders";

export const metadata: Metadata = { title: t("vendorOrders.title") };

export default function VendorOrdersPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Orders />
    </Suspense>
  );
}

const SECTIONS: { status: PayoutStatus; title: "vendorOrders.sectionIssued" | "vendorOrders.sectionCurrent" | "vendorOrders.sectionPaid" }[] = [
  { status: "ISSUED", title: "vendorOrders.sectionIssued" },
  { status: "ACKNOWLEDGED", title: "vendorOrders.sectionCurrent" },
  { status: "PAID", title: "vendorOrders.sectionPaid" },
];

async function Orders() {
  const user = await requirePortal("vendor");
  const orders = await listVendorOrders(user.vendor.id);
  return (
    <div className="space-y-5">
      <PageHeader title={t("vendorOrders.title")} subtitle={t("vendorOrders.intro")} />
      {orders.length === 0 && <EmptyState icon={<Package aria-hidden className="size-6" />} title={t("vendorOrders.none")} body={t("vendorOrders.noneBody")} />}
      {SECTIONS.map(({ status, title }) => {
        const inSection = orders.filter((o) => o.status === status);
        if (inSection.length === 0) return null;
        return (
          <section key={status} aria-labelledby={`orders-${status}`}>
            <SectionTitle>
              <span id={`orders-${status}`}>{t(title)}</span>
            </SectionTitle>
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {inSection.map((o) => (
                <li key={o.id}>
                  <Link href={`/vendor/orders/${o.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block font-medium text-fg">
                        {t("vendorOrders.number", { n: o.number })} · {o.round.title}
                      </span>
                      <span className="block text-muted">
                        {o.round.community.name} · {whenText(o.round)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold text-fg tabular-nums">{formatINR(o.payout.payoutPaise)}</span>
                      <OrderStatusBadge status={o.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

import { CheckCheck, ChevronLeft, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/orders/print-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/skeleton";
import { lineName, whenText } from "@/components/vendor/order-text";
import { OrderStatusBadge, PayoutBreakdown } from "@/components/vendor/payout";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatBps, formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { acknowledgeOrderAction } from "@/server/actions/vendor";
import { getVendorOrder } from "@/server/vendor-orders";

export const metadata: Metadata = { title: t("vendorOrders.title") };

export default function VendorOrderPage({ params }: PageProps<"/vendor/orders/[orderId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Order params={params} />
    </Suspense>
  );
}

/** A purchase order (goods) or job sheet (services), laid out to print, with what the vendor is paid. */
async function Order({ params }: { params: PageProps<"/vendor/orders/[orderId]">["params"] }) {
  const user = await requirePortal("vendor");
  const { orderId } = await params;
  const order = await getVendorOrder(user.vendor.id, orderId);
  if (!order) notFound();
  const { round } = order;
  const title = t(round.kind === "GROCERY" ? "vendorOrders.purchaseOrder" : "vendorOrders.jobSheet", { n: order.number });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/vendor/orders" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
          <ChevronLeft aria-hidden className="size-4" />
          {t("vendorOrders.back")}
        </Link>
        <div className="flex flex-wrap gap-2">
          <a href={`/vendor/orders/${order.id}/csv`} download className={buttonClasses({ variant: "secondary" })}>
            <Download aria-hidden className="size-4" />
            {t("vendorOrders.csv")}
          </a>
          <PrintButton label={t("vendorOrders.print")} />
        </div>
      </div>

      {order.status === "ISSUED" && (
        <ActionForm action={acknowledgeOrderAction} className="print:hidden">
          <input type="hidden" name="orderId" value={order.id} />
          <SubmitButton block icon={<CheckCheck aria-hidden className="size-4" />}>
            {t("vendorOrders.acknowledge")}
          </SubmitButton>
        </ActionForm>
      )}

      <article aria-labelledby="po-title" className="space-y-5 rounded-card border border-border bg-surface p-4 text-sm shadow-card sm:p-6 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id="po-title" className="text-xl font-semibold tracking-tight text-fg">
              {title}
            </h1>
            <p className="text-muted">{round.title}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("vendorOrders.to")}</h2>
            <p className="font-medium text-fg">{order.vendor.name}</p>
            {order.vendor.gstin && <p className="text-muted">GSTIN {order.vendor.gstin}</p>}
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("vendorOrders.deliverTo")}</h2>
            <p className="font-medium text-fg">{round.community.name}</p>
            <p className="text-muted">
              {round.community.address}, {round.community.city} {round.community.pincode}
            </p>
            <p className="font-medium text-fg">{whenText(round)}</p>
          </div>
        </div>
        <p className="text-muted">
          {t("vendorOrders.issuedOn", { when: formatIST(order.createdAt) })}
          {order.acknowledgedAt && ` · ${t("vendorOrders.acknowledgedOn", { when: formatIST(order.acknowledgedAt) })}`}
          {order.paidAt && ` · ${t("vendorOrders.paidOn", { when: formatIST(order.paidAt) })}`}
        </p>

        <section aria-labelledby="po-items">
          <h2 id="po-items" className="mb-2 font-semibold text-fg">
            {t("vendorOrders.items")}
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {order.lines.map((line) => {
              const { item, detail } = lineName(line);
              return (
                <li key={line.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">
                      {item} <span className="font-normal text-muted">· {detail}</span>
                    </span>
                    <span className="block text-muted tabular-nums">{t("vendorOrders.qtyAt", { qty: line.quantity, price: formatINR(line.vendorPricePaise), gst: formatBps(line.gstBps) })}</span>
                  </span>
                  <span className="shrink-0 font-medium text-fg tabular-nums">{formatINR(line.lineTotalPaise)}</span>
                </li>
              );
            })}
          </ul>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("vendorOrders.subtotal")}</dt>
              <dd className="tabular-nums">{formatINR(order.subtotalPaise)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("vendorOrders.gst")}</dt>
              <dd className="tabular-nums">{formatINR(order.gstPaise)}</dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold text-fg">
              <dt>{t("vendorOrders.total")}</dt>
              <dd className="tabular-nums">{formatINR(order.totalPaise)}</dd>
            </div>
          </dl>
          {order.visits.total > 0 && <p className="mt-2 text-muted">{t("vendorOrders.visitsDone", { done: order.visits.done, total: order.visits.total })}</p>}
        </section>

        <section aria-labelledby="po-payout" className="space-y-2 rounded-control bg-surface-2/60 p-3 print:bg-transparent print:p-0">
          <h2 id="po-payout" className="font-semibold text-fg">
            {t("vendorOrders.payoutTitle")}
          </h2>
          <p className="text-muted">{order.payout.changes.length > 0 ? t("vendorOrders.payoutIntro") : t("vendorOrders.noChanges")}</p>
          <PayoutBreakdown payout={order.payout} />
          <p className="text-muted">{order.paidAt ? t("vendorOrders.paidOn", { when: formatIST(order.paidAt) }) : t("vendorOrders.notPaidYet")}</p>
          {order.adjustments.length > 0 && (
            <details className="print:open">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-brand">{t("vendorOrders.changesTitle")}</summary>
              <ul className="space-y-1 text-muted">
                {order.adjustments.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>
                      {a.visit ? `${a.visit.flat.tower}-${a.visit.flat.number}: ` : ""}
                      {a.note ?? t(`vendorOrders.change.${a.type}`)}
                    </span>
                    <span className="tabular-nums">{formatINR(a.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </article>
    </div>
  );
}

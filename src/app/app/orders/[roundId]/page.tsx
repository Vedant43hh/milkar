import { Ban, ChevronLeft, Clock, FileText, KeyRound, PackageCheck, Pencil, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VisitCard } from "@/components/orders/visit-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { getRoundHistory, type RoundHistory } from "@/server/history";

export const metadata: Metadata = { title: t("orders.title") };

export default function OrderPage({ params }: PageProps<"/app/orders/[roundId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Order params={params} />
    </Suspense>
  );
}

async function Order({ params }: { params: PageProps<"/app/orders/[roundId]">["params"] }) {
  const user = await requirePortal("app");
  const { roundId } = await params;
  const community = user.flat.community;
  const history = await getRoundHistory({ id: user.id, flatId: user.flatId, communityId: community.id }, roundId, new Date());
  if (!history) notFound();
  const { round, items, money, credits, visits, pickup } = history;
  const shopHref = round.kind === "SERVICE" ? `/app/services/${round.id}` : `/app/groceries?round=${round.id}`;

  return (
    <PullToRefresh>
      <Link href="/app/orders" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("orders.title")}
      </Link>
      <PageHeader
        title={round.title}
        subtitle={[t(`roundKind.${round.kind}`), t(`roundStatus.${round.status}`), round.finalizedAt ? t("orders.detail.finalizedOn", { when: formatIST(round.finalizedAt, "date") }) : null]
          .filter(Boolean)
          .join(" · ")}
      />

      <div className="space-y-3">
        {round.status === "OPEN" && (
          <Banner
            tone="info"
            icon={<Clock aria-hidden className="size-4" />}
            action={
              <ButtonLink href={shopHref} size="sm" icon={<Pencil aria-hidden className="size-4" />}>
                {t("orders.detail.changeOrder")}
              </ButtonLink>
            }
          >
            {t("orders.detail.openNote", { when: formatIST(round.cutoffAt) })}
          </Banner>
        )}
        {round.status === "CANCELLED" && (
          <Banner tone="danger" icon={<Ban aria-hidden className="size-4" />}>
            {t("orders.detail.cancelled", { reason: round.cancelReason ?? "" })}
          </Banner>
        )}
      </div>

      {visits.length > 0 && (
        <section aria-labelledby="visits">
          <SectionTitle>
            <span id="visits">{t(visits.length > 1 ? "orders.visits.titleMany" : "orders.visits.title")}</span>
          </SectionTitle>
          <div className="space-y-3">
            {visits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} title={round.serviceName ?? round.title} roundId={round.id} />
            ))}
          </div>
        </section>
      )}

      {round.kind === "GROCERY" && round.status !== "CANCELLED" && (
        <Card className="mt-6 space-y-2">
          <CardHeader title={t("orders.detail.pickupTitle")} />
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Truck aria-hidden className="size-4" />
            {t("orders.detail.delivery", { when: formatIST(round.deliveryAt) })}
          </p>
          {pickup && (
            <>
              {round.requirePickupCode && pickup.status === "PENDING" && (
                <div className="flex flex-wrap items-center gap-2 rounded-control bg-accent-soft px-3 py-2">
                  <KeyRound aria-hidden className="size-4 text-accent-soft-fg" />
                  <span className="font-semibold text-accent-soft-fg tabular-nums">{t("orders.detail.pickupCode", { code: pickup.pickupCode })}</span>
                  <span className="text-xs text-accent-soft-fg">{t("orders.detail.pickupHint")}</span>
                </div>
              )}
              <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <PackageCheck aria-hidden className="size-4 text-brand" />
                {pickup.status === "COLLECTED" && pickup.collectedAt ? t("orders.detail.collected", { when: formatIST(pickup.collectedAt) }) : t("orders.detail.pending")}
              </p>
            </>
          )}
        </Card>
      )}

      <section aria-labelledby="items">
        <SectionTitle>
          <span id="items">{t("orders.detail.itemsTitle")}</span>
        </SectionTitle>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{t("orders.detail.noItems")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} finalized={round.finalizedAt !== null} />
            ))}
          </ul>
        )}
      </section>

      <Card className="mt-6 space-y-4" labelledBy="money-title">
        <CardHeader
          titleId="money-title"
          title={t("orders.detail.moneyTitle")}
          action={
            history.hasInvoice ? (
              <ButtonLink href={`/app/orders/${round.id}/invoice`} variant="secondary" size="sm" icon={<FileText aria-hidden className="size-4" />}>
                {t("orders.detail.invoice")}
              </ButtonLink>
            ) : undefined
          }
        />
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted">{t("orders.detail.paid")}</dt>
            <dd className="text-base font-semibold text-fg tabular-nums">{formatINR(money.paidPaise)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("orders.detail.refunded")}</dt>
            <dd className="text-base font-semibold text-success tabular-nums">{formatINR(money.refundedPaise)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("orders.detail.net")}</dt>
            <dd className="text-base font-semibold text-fg tabular-nums">{formatINR(money.netPaise)}</dd>
          </div>
        </dl>
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-fg">{t("orders.detail.creditsTitle")}</h3>
          {credits.length === 0 ? (
            <p className="text-sm text-muted">{t("orders.detail.noCredits")}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {credits.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-fg">{t(`wallet.reasons.${c.type}`)}</span>
                    <span className="block text-xs text-muted">{formatIST(c.createdAt)}</span>
                  </span>
                  <span className="font-medium text-success tabular-nums">+{formatINR(c.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </PullToRefresh>
  );
}

function ItemRow({ item, finalized }: { item: RoundHistory["items"][number]; finalized: boolean }) {
  const tone = item.status === "CONFIRMED" ? "success" : item.status === "DROPPED" || item.status === "CANCELLED" ? "neutral" : "brand";
  const unit = finalized && item.finalUnitPaise !== null ? item.finalUnitPaise : null;
  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium text-fg">{item.name}</span>
          <span className="block text-xs text-muted">{item.vendor}</span>
        </span>
        <Badge tone={tone}>{t(`orders.itemStatus.${item.status}`)}</Badge>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums">
        <span className="text-muted">{unit !== null ? t("orders.detail.qtyAt", { qty: item.quantity, price: formatINR(unit) }) : `× ${item.quantity}`}</span>
        <span className="text-fg">{t("orders.detail.paidLine", { amount: formatINR(item.chargedPaise) })}</span>
        {item.finalPaise !== null && item.status === "CONFIRMED" && <span className="text-fg">{t("orders.detail.finalLine", { amount: formatINR(item.finalPaise) })}</span>}
        {item.refundPaise > 0 && <span className="font-medium text-success">{t("orders.detail.refundLine", { amount: formatINR(item.refundPaise) })}</span>}
      </p>
      {item.status === "DROPPED" && <p className="text-xs text-muted">{t("orders.detail.dropped")}</p>}
      {item.shortQty + item.damagedQty > 0 && <p className="text-xs text-muted">{t("orders.detail.short", { n: item.shortQty + item.damagedQty })}</p>}
    </li>
  );
}

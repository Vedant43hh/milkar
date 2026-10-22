import { ArrowRight, CalendarClock, ReceiptText, ShoppingBasket, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { listOrderHistory, type OrderHistoryEntry } from "@/server/history";

export const metadata: Metadata = { title: t("orders.title") };

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={4} />}>
      <Orders />
    </Suspense>
  );
}

const STATUS_TONE: Record<string, "brand" | "accent" | "success" | "neutral" | "danger"> = {
  OPEN: "brand",
  FINALIZING: "accent",
  FINALIZED: "accent",
  COMPLETED: "success",
  CANCELLED: "danger",
};

async function Orders() {
  const user = await requirePortal("app");
  const community = user.flat.community;
  const history = await listOrderHistory({ id: user.id, flatId: user.flatId, communityId: community.id });
  const comingUp = history.filter((h) => h.nextVisit);

  return (
    <PullToRefresh>
      <PageHeader title={t("orders.title")} subtitle={t("orders.intro", { unit: community.unitLabel.toLowerCase() })} />
      {history.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden className="size-6" />}
          title={t("orders.empty")}
          body={t("orders.emptyBody")}
          action={
            <ButtonLink href="/app/buys" variant="secondary">
              {t("orders.browse")}
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          }
        />
      ) : (
        <>
          {comingUp.length > 0 && (
            <section aria-labelledby="coming-up">
              <SectionTitle>
                <span id="coming-up">{t("orders.comingUp")}</span>
              </SectionTitle>
              <ul className="space-y-2">
                {comingUp.map((h) => (
                  <li key={h.id}>
                    <Link href={`/app/orders/${h.id}`} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card hover:border-brand/50">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
                        <CalendarClock aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">{h.serviceName ?? h.title}</span>
                        <span className="block text-sm text-muted">{t("orders.nextVisit", { when: formatIST(h.nextVisit!.startsAt) })}</span>
                      </span>
                      <Badge tone="brand">{t(`visitStatus.${h.nextVisit!.status}`)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="history">
            <SectionTitle>
              <span id="history">{t("orders.historyTitle")}</span>
            </SectionTitle>
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id}>
                  <HistoryCard entry={h} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </PullToRefresh>
  );
}

function HistoryCard({ entry }: { entry: OrderHistoryEntry }) {
  const Icon = entry.kind === "SERVICE" ? Sparkles : ShoppingBasket;
  const { money } = entry;
  return (
    <Link href={`/app/orders/${entry.id}`} className="group block space-y-2 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge icon={<Icon aria-hidden className="size-3.5" />}>{t(`roundKind.${entry.kind}`)}</Badge>
            <Badge tone={STATUS_TONE[entry.status] ?? "neutral"}>{t(`roundStatus.${entry.status}`)}</Badge>
          </div>
          <h3 className="font-semibold text-fg">{entry.title}</h3>
          <p className="text-sm text-muted">{entry.takingOrders ? t("orders.closes", { when: formatIST(entry.date) }) : formatIST(entry.date, "date")}</p>
        </div>
        <ArrowRight aria-hidden className="mt-1 size-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {entry.units > 0 ? <span className="text-muted">{t("orders.inOrder", { n: entry.units })}</span> : <span className="text-muted">{t("orders.nothingOrdered")}</span>}
        {money.paidPaise > 0 && <span className="font-medium text-fg tabular-nums">{t("orders.paid", { amount: formatINR(money.paidPaise) })}</span>}
        {money.refundedPaise > 0 && <span className="font-medium text-success tabular-nums">{t("orders.back", { amount: formatINR(money.refundedPaise) })}</span>}
      </p>
    </Link>
  );
}

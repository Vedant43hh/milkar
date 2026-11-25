import { ArrowRight, Repeat } from "lucide-react";
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

const STATUS_TONE: Record<string, "info" | "warning" | "success" | "neutral" | "danger"> = {
  OPEN: "info",
  FINALIZING: "warning",
  FINALIZED: "success",
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
      <PageHeader
        title={t("orders.title")}
        subtitle={t("orders.intro", { unit: community.unitLabel.toLowerCase() })}
        action={
          <ButtonLink href="/app/subscriptions" variant="secondary" size="sm" icon={<Repeat aria-hidden className="size-4" />}>
            {t("subscriptions.title")}
          </ButtonLink>
        }
      />
      {history.length === 0 ? (
        <EmptyState
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
              <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                {comingUp.map((h) => (
                  <li key={h.id}>
                    <Link href={`/app/orders/${h.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-fg">{h.serviceName ?? h.title}</span>
                        <span className="block text-sm text-muted">{t("orders.nextVisit", { when: formatIST(h.nextVisit!.startsAt) })}</span>
                      </span>
                      <Badge tone="info">{t(`visitStatus.${h.nextVisit!.status}`)}</Badge>
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
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
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
  const { money } = entry;
  return (
    <Link href={`/app/orders/${entry.id}`} className="group block space-y-2 p-4 transition-colors hover:bg-surface-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{t(`roundKind.${entry.kind}`)}</Badge>
            <Badge tone={STATUS_TONE[entry.status] ?? "neutral"}>{t(`roundStatus.${entry.status}`)}</Badge>
          </div>
          <h3 className="font-semibold text-fg">{entry.title}</h3>
          <p className="text-sm text-muted">{entry.takingOrders ? t("orders.closes", { when: formatIST(entry.date) }) : formatIST(entry.date, "date")}</p>
        </div>
        <ArrowRight aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {entry.units > 0 ? <span className="text-muted">{t("orders.inOrder", { n: entry.units })}</span> : <span className="text-muted">{t("orders.nothingOrdered")}</span>}
        {money.paidPaise > 0 && <span className="font-medium text-fg tabular-nums">{t("orders.paid", { amount: formatINR(money.paidPaise) })}</span>}
        {money.refundedPaise > 0 && <span className="font-medium text-success tabular-nums">{t("orders.back", { amount: formatINR(money.refundedPaise) })}</span>}
      </p>
    </Link>
  );
}

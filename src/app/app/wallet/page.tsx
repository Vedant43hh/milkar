import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, SectionTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/display";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { getWalletLedger } from "@/server/history";

export const metadata: Metadata = { title: t("wallet.title") };

export default function WalletPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <WalletView />
    </Suspense>
  );
}

const TAKE = 100;

/** The balance, and every credit and debit with what it was for, newest first. */
async function WalletView() {
  const user = await requirePortal("app");
  const { balancePaise, entries, hasMore } = await getWalletLedger(user.id, TAKE);

  return (
    <PullToRefresh>
      <PageHeader title={t("wallet.title")} subtitle={t("wallet.intro")} />
      <Card className="flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
          <Wallet aria-hidden className="size-6" />
        </span>
        <div>
          <p className="text-sm text-muted">{t("wallet.balance")}</p>
          <p className="text-3xl font-bold text-fg tabular-nums">{formatINR(balancePaise)}</p>
        </div>
      </Card>

      <section aria-labelledby="history">
        <SectionTitle>
          <span id="history">{t("wallet.historyTitle")}</span>
        </SectionTitle>
        {entries.length === 0 ? (
          <EmptyState icon={<Wallet aria-hidden className="size-6" />} title={t("wallet.empty")} body={t("wallet.emptyBody")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {entries.map((entry) => {
              const credit = entry.amountPaise > 0;
              const Icon = credit ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", credit ? "bg-success-soft text-success" : "bg-surface-2 text-muted")}>
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{t(`wallet.reasons.${entry.type}`)}</span>
                    <span className="block truncate text-sm text-muted">
                      {entry.round ? (
                        <Link href={`/app/orders/${entry.round.id}`} className="text-brand underline-offset-2 hover:underline">
                          {entry.round.title}
                        </Link>
                      ) : (
                        entry.note
                      )}
                    </span>
                    <span className="block text-xs text-subtle">{formatIST(entry.createdAt)}</span>
                  </span>
                  <span className={cn("font-semibold tabular-nums", credit ? "text-success" : "text-fg")}>
                    {credit ? "+" : "−"}
                    {formatINR(Math.abs(entry.amountPaise))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && <p className="mt-2 text-xs text-muted">{t("wallet.more", { n: TAKE })}</p>}
      </section>
    </PullToRefresh>
  );
}

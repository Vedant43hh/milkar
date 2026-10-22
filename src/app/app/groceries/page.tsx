import { Clock, Megaphone, ShoppingBasket, Snowflake, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GroceryShop } from "@/components/shop/grocery-shop";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Countdown } from "@/components/ui/countdown";
import { Banner, EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatIST } from "@/lib/time";
import { getShop, openGroceryRounds } from "@/server/shop";

export const metadata: Metadata = { title: t("shop.title") };

export default function GroceriesPage({ searchParams }: PageProps<"/app/groceries">) {
  return (
    <Suspense fallback={<PageSkeleton cards={4} />}>
      <Groceries searchParams={searchParams} />
    </Suspense>
  );
}

async function Groceries({ searchParams }: { searchParams: PageProps<"/app/groceries">["searchParams"] }) {
  const user = await requirePortal("app");
  const now = new Date();
  const params = await searchParams;
  const community = user.flat.community;
  const rounds = await openGroceryRounds(community.id, now);
  const chosen = rounds.find((r) => r.id === params.round) ?? rounds[0];

  if (!chosen) {
    return (
      <div>
        <PageHeader title={t("shop.title")} />
        <EmptyState
          icon={<ShoppingBasket aria-hidden className="size-6" />}
          title={t("shop.noRound")}
          body={t("shop.noRoundBody")}
          action={
            <ButtonLink href="/app/polls" variant="secondary" icon={<Megaphone aria-hidden className="size-4" />}>
              {t("shop.seePolls")}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const shop = await getShop({ id: user.id, flatId: user.flatId, communityId: community.id }, chosen.id, now);
  if (!shop) return null;
  const { round } = shop;

  return (
    <PullToRefresh>
      <PageHeader title={t("shop.title")} subtitle={t("shop.intro", { community: community.name })} />
      {rounds.length > 1 && (
        <nav aria-label={t("shop.otherRounds")} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          {rounds.map((r) => (
            <Link
              key={r.id}
              href={`/app/groceries?round=${r.id}`}
              aria-current={r.id === chosen.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm",
                r.id === chosen.id ? "border-brand bg-brand-soft font-medium text-brand-soft-fg" : "border-border bg-surface text-muted",
              )}
            >
              {r.title}
            </Link>
          ))}
        </nav>
      )}
      <section aria-labelledby="round-title" className="mb-4 space-y-2">
        <h2 id="round-title" className="text-lg font-semibold text-fg">
          {round.title}
        </h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Countdown to={round.cutoffAt} />
          <span className="inline-flex items-center gap-1 text-muted">
            <Truck aria-hidden className="size-3.5" />
            {t("shop.delivery", { when: formatIST(new Date(round.deliveryAt)) })}
          </span>
        </div>
        {round.canReduce ? (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Clock aria-hidden className="size-3.5" />
            {t("shop.freezeNote", { when: formatIST(new Date(round.freezeAt)) })}
          </p>
        ) : (
          <Banner tone={round.canAdd ? "warning" : "danger"} icon={<Snowflake aria-hidden className="size-4" />}>
            {t(round.canAdd ? "shop.frozen" : "shop.closed")}
          </Banner>
        )}
      </section>
      <GroceryShop shop={shop} text={messages().shop} />
    </PullToRefresh>
  );
}

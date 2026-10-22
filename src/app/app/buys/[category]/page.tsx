import { ArrowRight, ChevronLeft, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryChips } from "@/components/buys/category-chips";
import { CATEGORY_LOOK, GroupBuyCard } from "@/components/buys/group-buy-card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { BUY_CATEGORIES, CATEGORY_SLUG, categoryFromSlug, type BuyCategory } from "@/lib/categories";
import { openGroupBuys } from "@/server/group-buys";

export const metadata: Metadata = { title: t("buys.title") };

export function generateStaticParams() {
  return BUY_CATEGORIES.map((c) => ({ category: CATEGORY_SLUG[c] }));
}

export default function CategoryPage({ params }: PageProps<"/app/buys/[category]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Category params={params} />
    </Suspense>
  );
}

/** The open group buys of one kind: groceries, home services, repairs or subscriptions. */
async function Category({ params }: { params: PageProps<"/app/buys/[category]">["params"] }) {
  const user = await requirePortal("app");
  const category = categoryFromSlug((await params).category);
  if (!category) notFound();
  const community = user.flat.community;
  const buys = await openGroupBuys({ id: user.id, flatId: user.flatId, communityId: community.id }, new Date());
  const counts = Object.fromEntries(BUY_CATEGORIES.map((c) => [c, buys.filter((b) => b.category === c).length])) as Record<BuyCategory, number>;
  const shown = buys.filter((b) => b.category === category);
  const name = t(`buys.categories.${category}.name`);
  const Icon = CATEGORY_LOOK[category].icon;

  return (
    <PullToRefresh>
      <Link href="/app/buys" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("buys.all")}
      </Link>
      <PageHeader title={name} subtitle={t(`buys.categories.${category}.body`)} />
      <CategoryChips counts={counts} current={category} />
      {shown.length === 0 ? (
        <EmptyState
          icon={<Icon aria-hidden className="size-6" />}
          title={t("buys.categoryEmpty", { category: name.toLowerCase() })}
          body={t("buys.categoryEmptyBody")}
          action={
            <ButtonLink href="/app/polls" variant="secondary" icon={<Megaphone aria-hidden className="size-4" />}>
              {t("buys.vote")}
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((buy) => (
            <GroupBuyCard key={buy.id} buy={buy} unitLabel={community.unitLabel} />
          ))}
        </div>
      )}
    </PullToRefresh>
  );
}

import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CATEGORY_LOOK } from "@/components/buys/group-buy-card";
import { PageHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { BUY_CATEGORIES, CATEGORY_SLUG } from "@/lib/categories";
import { openBuysByCategory } from "@/server/buys";

export const metadata: Metadata = { title: t("buys.title") };

export default function GroupBuysPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={4} />}>
      <GroupBuys />
    </Suspense>
  );
}

/** The four kinds of group buy, with how many are open in the resident's community right now. */
async function GroupBuys() {
  const user = await requirePortal("app");
  const counts = await openBuysByCategory(user.flat.community.id, new Date());
  return (
    <>
      <PageHeader title={t("buys.title")} subtitle={t("buys.intro")} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {BUY_CATEGORIES.map((category) => {
          const { icon: Icon, tint } = CATEGORY_LOOK[category];
          const open = counts[category];
          return (
            <li key={category}>
              <Link
                href={`/app/buys/${CATEGORY_SLUG[category]}`}
                className="group flex h-full items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50"
              >
                <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", tint)}>
                  <Icon aria-hidden className="size-6" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-fg">{t(`buys.categories.${category}.name`)}</span>
                  <span className="block text-sm text-muted">{t(`buys.categories.${category}.body`)}</span>
                  <span className={cn("block text-sm font-medium", open > 0 ? "text-brand" : "text-subtle")}>
                    {open > 0 ? t("buys.open", { n: open }) : t("buys.noneOpen")}
                  </span>
                </span>
                <ArrowRight aria-hidden className="mt-1 size-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

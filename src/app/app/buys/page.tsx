import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {BUY_CATEGORIES.map((category) => {
          const open = counts[category];
          return (
            <li key={category}>
              <Link
                href={`/app/buys/${CATEGORY_SLUG[category]}`}
                className="flex h-full items-start gap-3 p-4 transition-colors hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-fg">{t(`buys.categories.${category}.name`)}</span>
                  <span className="block text-sm text-muted">{t(`buys.categories.${category}.body`)}</span>
                  <span className={cn("block text-sm font-medium", open > 0 ? "text-accent" : "text-muted")}>
                    {open > 0 ? t("buys.open", { n: open }) : t("buys.noneOpen")}
                  </span>
                </span>
                <ArrowRight aria-hidden className="mt-1 size-5 shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

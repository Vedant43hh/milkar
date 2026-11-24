import { ChevronRight, Repeat, ShoppingBasket, Sparkles, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: t("manager.newRound") };

const KINDS = [
  { href: "/manager/rounds/new/grocery", icon: ShoppingBasket, kind: "GROCERIES" },
  { href: "/manager/rounds/new/service?kind=home-services", icon: Sparkles, kind: "HOME_SERVICES" },
  { href: "/manager/rounds/new/service?kind=repairs", icon: Wrench, kind: "REPAIRS" },
  { href: "/manager/rounds/new/service?kind=subscriptions", icon: Repeat, kind: "SUBSCRIPTIONS" },
] as const;

export default function NewRoundPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={4} />}>
      <Chooser />
    </Suspense>
  );
}

/** Groceries, a Service Day, a Repair Day or a weekly subscription. */
async function Chooser() {
  await requirePortal("manager");
  return (
    <div>
      <PageHeader title={t("manager.chooseKind")} />
      <div className="grid gap-3 md:grid-cols-2">
        {KINDS.map(({ href, icon: Icon, kind }) => (
          <Link key={href} href={href} className="group flex items-start gap-3 rounded-card p-4 sm:p-5 neu-raised transition-[box-shadow] duration-200 ease-in-out hover:neu-raised-sm active:neu-pressed">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full text-brand neu-pressed-xs">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">{t(`manager.form.kinds.${kind}.title`)}</span>
              <span className="mt-0.5 block text-sm text-muted">{t(`manager.form.kinds.${kind}.body`)}</span>
            </span>
            <ChevronRight aria-hidden className="mt-1 size-5 text-subtle transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}

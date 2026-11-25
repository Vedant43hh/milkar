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
      <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {KINDS.map(({ href, kind }) => (
          <Link key={href} href={href} className="group flex items-start gap-3 p-4 transition-colors hover:bg-surface-hover">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">{t(`manager.form.kinds.${kind}.title`)}</span>
              <span className="mt-0.5 block text-sm text-muted">{t(`manager.form.kinds.${kind}.body`)}</span>
            </span>
            <ChevronRight aria-hidden className="mt-1 size-5 text-muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}

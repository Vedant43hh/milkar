import { ChevronRight, ShoppingBasket, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: t("manager.newRound") };

const KINDS = [
  { href: "/manager/rounds/new/grocery", icon: ShoppingBasket, title: "manager.newGrocery", body: "manager.groceryCardBody" },
  { href: "/manager/rounds/new/service", icon: Sparkles, title: "manager.newService", body: "manager.serviceCardBody" },
] as const;

export default function NewRoundPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Chooser />
    </Suspense>
  );
}

async function Chooser() {
  await requirePortal("manager");
  return (
    <div>
      <PageHeader title={t("manager.chooseKind")} />
      <div className="grid gap-3 md:grid-cols-2">
        {KINDS.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group flex items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">{t(title)}</span>
              <span className="mt-0.5 block text-sm text-muted">{t(body)}</span>
            </span>
            <ChevronRight aria-hidden className="mt-1 size-5 text-subtle transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}

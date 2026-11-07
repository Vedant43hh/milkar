import { ArrowRight, Building2, IndianRupee, MessageSquareWarning, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { adminHome } from "@/server/admin";

export default function AdminPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <AdminHome />
    </Suspense>
  );
}

/** What's waiting for the platform admin, each a link to its queue. */
async function AdminHome() {
  const user = await requirePortal("admin");
  const home = await adminHome(new Date());
  const queues = [
    { href: "/admin/communities", label: t("adminHome.communities"), n: home.communities, icon: Building2 },
    { href: "/admin/vendors", label: t("adminHome.vendors"), n: home.vendors, icon: Store },
    { href: "/admin/disputes", label: t("adminHome.disputes"), n: home.disputes, icon: MessageSquareWarning },
    { href: "/admin/payouts", label: t("adminHome.payouts"), n: home.payoutsReady, icon: IndianRupee, detail: home.payoutsReady > 0 ? t("adminHome.payoutsAmount", { amount: formatINR(home.payoutsReadyPaise) }) : null },
  ] as const;
  const waiting = queues.filter((q) => q.n > 0);
  return (
    <div className="space-y-5">
      <PageHeader title={t("areas.adminTitle")} subtitle={t("areas.signedInAs", { name: user.name ?? user.phone, role: t(`roles.${user.role}`) })} />
      <Card labelledBy="queues-title">
        <CardHeader titleId="queues-title" title={t("adminHome.queues")} />
        {waiting.length === 0 ? (
          <p className="text-sm text-muted">{t("adminHome.allClear")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {waiting.map(({ href, label, n, icon: Icon, ...q }) => (
              <li key={href}>
                <Link href={href} className="flex min-h-11 items-center gap-3 py-2.5 text-sm">
                  <Icon aria-hidden className="size-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{label}</span>
                    {"detail" in q && q.detail && <span className="block text-muted">{q.detail}</span>}
                  </span>
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-semibold text-accent-soft-fg tabular-nums">{n}</span>
                  <ArrowRight aria-hidden className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

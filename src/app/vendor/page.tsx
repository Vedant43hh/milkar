import { BadgeCheck, Ban, CircleCheck, Circle, Package } from "lucide-react";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Banner, EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { vendorChecklist } from "@/lib/registration";
import { vendorStanding } from "@/server/registration";

export default function VendorPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <VendorHome />
    </Suspense>
  );
}

async function VendorHome() {
  const user = await requirePortal("vendor");
  const vendor = await vendorStanding(user.vendor.id);
  return (
    <div className="space-y-5">
      <PageHeader title={`${t("areas.vendorTitle")} · ${vendor.name}`} subtitle={t("areas.signedInAs", { name: user.name ?? user.phone, role: t(`roles.${user.role}`) })} />
      <Verification vendor={vendor} />
      <EmptyState icon={<Package aria-hidden className="size-6" />} title={t("nav.vendorOrders")} body={t("placeholder.staffBody", { phase: 14 })} />
    </div>
  );
}

/** Where verification stands: a checklist until Milkar has verified the business. */
function Verification({ vendor }: { vendor: Awaited<ReturnType<typeof vendorStanding>> }) {
  if (vendor.verificationStatus === "VERIFIED") {
    return (
      <Banner tone="success" icon={<BadgeCheck aria-hidden className="size-4" />} title={t("verification.verifiedTitle")}>
        {t("verification.verifiedBody")}
      </Banner>
    );
  }
  const items = vendorChecklist({ ...vendor, catalogueItems: vendor._count.products + vendor._count.services });
  return (
    <Card>
      <CardHeader title={t("verification.title")} subtitle={vendor.verificationStatus === "REJECTED" ? undefined : t("verification.pendingBody")} />
      {vendor.verificationStatus === "REJECTED" && (
        <Banner tone="danger" icon={<Ban aria-hidden className="size-4" />} title={t("verification.rejectedTitle")}>
          {vendor.verificationNote ? t("verification.rejectedNote", { note: vendor.verificationNote }) : undefined}
        </Banner>
      )}
      <ul className="mt-3 space-y-3">
        {items.map((item) => {
          const Icon = item.done ? CircleCheck : Circle;
          return (
            <li key={item.key} className="flex items-start gap-3">
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", item.done ? "text-success" : "text-subtle")} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 font-medium text-fg">
                  {t(`verification.items.${item.key}.title`)}
                  {item.optional && <Badge>{t("verification.optional")}</Badge>}
                </span>
                <span className="block text-sm text-muted">{t(`verification.items.${item.key}.body`)}</span>
              </span>
              <span className={cn("text-xs font-semibold", item.done ? "text-success" : "text-muted")}>{item.done ? t("verification.done") : t("verification.todo")}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

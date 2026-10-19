import { Package } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function VendorPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <VendorHome />
    </Suspense>
  );
}

async function VendorHome() {
  const user = await requireArea("supplier");
  return (
    <>
      <PageHeader title={`${t("areas.supplierTitle")} · ${user.supplier?.name ?? ""}`} subtitle={t("areas.signedInAs", { name: user.name ?? user.phone, role: t(`roles.${user.role}`) })} />
      <EmptyState icon={<Package aria-hidden className="size-6" />} title={t("nav.vendorOrders")} body={t("placeholder.staffBody", { phase: 9 })} />
    </>
  );
}

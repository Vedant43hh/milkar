import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AreaPlaceholder } from "@/components/area-placeholder";
import { AppShell, Skeleton } from "@/components/ui";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function SupplierPage() {
  return (
    <AppShell right={<Suspense><AccountMenu /></Suspense>}>
      <Suspense fallback={<Skeleton />}>
        <SupplierHome />
      </Suspense>
    </AppShell>
  );
}

async function SupplierHome() {
  const user = await requireArea("supplier");
  return <AreaPlaceholder title={`${t("areas.supplierTitle")} · ${user.supplier?.name ?? ""}`} user={user} phase={6} />;
}

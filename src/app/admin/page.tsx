import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AreaPlaceholder } from "@/components/area-placeholder";
import { AppShell, Skeleton } from "@/components/ui";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function AdminPage() {
  return (
    <AppShell right={<Suspense><AccountMenu /></Suspense>}>
      <Suspense fallback={<Skeleton />}>
        <AdminHome />
      </Suspense>
    </AppShell>
  );
}

async function AdminHome() {
  const user = await requireArea("admin");
  return <AreaPlaceholder title={t("areas.adminTitle")} user={user} phase={9} />;
}

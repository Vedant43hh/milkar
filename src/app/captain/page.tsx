import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AreaPlaceholder } from "@/components/area-placeholder";
import { AppShell, Skeleton } from "@/components/ui";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function CaptainPage() {
  return (
    <AppShell right={<Suspense><AccountMenu /></Suspense>}>
      <Suspense fallback={<Skeleton />}>
        <CaptainHome />
      </Suspense>
    </AppShell>
  );
}

async function CaptainHome() {
  const user = await requireArea("captain");
  return <AreaPlaceholder title={t("areas.captainTitle")} user={user} phase={3} />;
}

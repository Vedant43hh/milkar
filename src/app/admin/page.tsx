import { ChartColumn } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function AdminPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  const user = await requireArea("admin");
  return (
    <>
      <PageHeader title={t("areas.adminTitle")} subtitle={t("areas.signedInAs", { name: user.name ?? user.phone, role: t(`roles.${user.role}`) })} />
      <EmptyState icon={<ChartColumn aria-hidden className="size-6" />} title={t("nav.stats")} body={t("placeholder.staffBody", { phase: 12 })} />
    </>
  );
}

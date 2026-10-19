import { ClipboardList } from "lucide-react";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";

export default function CaptainPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <CaptainHome />
    </Suspense>
  );
}

async function CaptainHome() {
  const user = await requireArea("captain");
  return (
    <>
      <PageHeader title={t("areas.captainTitle")} subtitle={t("areas.signedInAs", { name: user.name ?? user.phone, role: t(`roles.${user.role}`) })} />
      <EmptyState icon={<ClipboardList aria-hidden className="size-6" />} title={t("nav.rounds")} body={t("placeholder.staffBody", { phase: 5 })} />
    </>
  );
}

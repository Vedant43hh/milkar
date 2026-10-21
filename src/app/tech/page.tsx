import { Wrench } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { VisitList } from "@/components/tech/visit-list";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { ListSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { technicianVisits } from "@/server/technician";

export const metadata: Metadata = { title: t("tech.todayTitle") };

export default function TechnicianTodayPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  const user = await requirePortal("tech");
  const visits = await technicianVisits(user.id, "today", new Date());
  return (
    <>
      <PageHeader title={t("tech.todayTitle")} subtitle={t("tech.todayIntro")} />
      <VisitList visits={visits} empty={<EmptyState icon={<Wrench aria-hidden className="size-6" />} title={t("tech.noVisitsToday")} body={t("tech.noVisitsTodayBody")} />} />
    </>
  );
}

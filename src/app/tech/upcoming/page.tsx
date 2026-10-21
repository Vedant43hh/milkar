import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { VisitList } from "@/components/tech/visit-list";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { ListSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { technicianVisits } from "@/server/technician";

export const metadata: Metadata = { title: t("tech.upcomingTitle") };

export default function TechnicianUpcomingPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Upcoming />
    </Suspense>
  );
}

async function Upcoming() {
  const user = await requirePortal("tech");
  const visits = await technicianVisits(user.id, "upcoming", new Date());
  return (
    <>
      <PageHeader title={t("tech.upcomingTitle")} subtitle={t("tech.upcomingIntro")} />
      <VisitList showDay visits={visits} empty={<EmptyState icon={<CalendarDays aria-hidden className="size-6" />} title={t("tech.noVisitsUpcoming")} />} />
    </>
  );
}

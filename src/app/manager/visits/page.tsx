import { CalendarCheck, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState, ListRow } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatIST } from "@/lib/time";
import { listVisitDays, type VisitDay } from "@/server/visit-board";

export const metadata: Metadata = { title: t("visitBoard.title") };

export default function VisitDaysPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <VisitDays />
    </Suspense>
  );
}

function DayRow({ day }: { day: VisitDay }) {
  const dates = day.first.getTime() === day.last.getTime() ? formatIST(day.first, "date") : t("visitBoard.dates", { from: formatIST(day.first, "date"), to: formatIST(day.last, "date") });
  return (
    <ListRow
      href={`/manager/visits/${day.id}`}
      icon={day.open > 0 ? <CalendarCheck aria-hidden className="size-5" /> : <CircleCheck aria-hidden className="size-5" />}
      title={day.title}
      subtitle={`${dates} · ${t("visitBoard.counts", { done: day.done, total: day.visits })}`}
      trailing={day.today ? <Badge tone="brand">{t("visitBoard.today")}</Badge> : day.open > 0 ? <Badge>{t("visitBoard.open", { n: day.open })}</Badge> : undefined}
    />
  );
}

function DaySection({ id, title, days }: { id: string; title: string; days: VisitDay[] }) {
  if (days.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <SectionTitle>
        <span id={id}>{title}</span>
      </SectionTitle>
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {days.map((day) => (
          <li key={day.id}>
            <DayRow day={day} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Confirmed Service Days and Repair Days: the ones with visits still to do first. */
async function VisitDays() {
  const user = await requirePortal("manager");
  const days = await listVisitDays(user.staff.community.id, new Date());
  const comingUp = days.filter((d) => d.open > 0);
  const past = days.filter((d) => d.open === 0);
  return (
    <div>
      <PageHeader title={t("visitBoard.title")} subtitle={t("visitBoard.intro")} />
      {days.length === 0 ? (
        <EmptyState icon={<CalendarCheck aria-hidden className="size-6" />} title={t("visitBoard.none")} body={t("visitBoard.noneBody")} />
      ) : (
        <>
          <DaySection id="coming-up" title={t("visitBoard.comingUp")} days={comingUp} />
          <DaySection id="past-days" title={t("visitBoard.past")} days={past} />
        </>
      )}
    </div>
  );
}

import { CalendarClock, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatIST } from "@/lib/time";
import { reassignVisitAction } from "@/server/actions/vendor";
import { vendorSchedule, type ScheduleRow } from "@/server/vendor-schedule";

export const metadata: Metadata = { title: t("vendorSchedule.title") };

export default function SchedulePage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Schedule />
    </Suspense>
  );
}

const STATUS_TONE = { SCHEDULED: "neutral", ON_THE_WAY: "brand", IN_PROGRESS: "brand", COMPLETED: "success", NO_ACCESS: "warning", CANCELLED: "neutral" } as const;

async function Schedule() {
  const user = await requirePortal("vendor");
  const { days, technicians, total } = await vendorSchedule(user.vendor.id, new Date());
  return (
    <div className="space-y-6">
      <PageHeader title={t("vendorSchedule.title")} subtitle={t("vendorSchedule.intro")} />
      {total === 0 && <EmptyState icon={<CalendarClock aria-hidden className="size-6" />} title={t("vendorSchedule.none")} body={t("vendorSchedule.noneBody")} />}
      {days.map((day) => (
        <section key={day.date} aria-labelledby={`day-${day.date}`} className="space-y-3">
          <h2 id={`day-${day.date}`} className="text-lg font-semibold text-fg">
            {formatIST(day.slots[0].startsAt, "weekdayDate")}
          </h2>
          {day.slots.map((slot) => (
            <div key={slot.startsAt.toISOString()} className="rounded-card border border-border bg-surface">
              <h3 className="border-b border-border px-4 py-2 text-sm font-semibold text-fg">
                {formatIST(slot.startsAt, "time")} – {formatIST(slot.endsAt, "time")}
              </h3>
              {slot.towers.map((tower) => (
                <div key={`${tower.community}-${tower.tower}`}>
                  <p className="bg-surface-2/60 px-4 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                    {t("vendorSchedule.tower", { community: tower.community, block: tower.visits[0].flat.community.blockLabel, tower: tower.tower })}
                  </p>
                  <ul className="divide-y divide-border">
                    {tower.visits.map((visit) => (
                      <VisitRow key={visit.id} visit={visit} technicians={technicians} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function VisitRow({ visit, technicians }: { visit: ScheduleRow; technicians: { id: string; name: string | null }[] }) {
  const flat = t("vendorSchedule.flat", { unit: visit.flat.community.unitLabel, tower: visit.flat.tower, number: visit.flat.number });
  const who = visit.technician?.name ?? visit.technicianName;
  const others = technicians.filter((tech) => tech.id !== visit.technicianId);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg">{flat}</span>
          <Badge tone={STATUS_TONE[visit.status]}>{t(`visitStatus.${visit.status}`)}</Badge>
          {visit.kind === "REVISIT" && <Badge tone="accent">{t("vendorSchedule.revisit")}</Badge>}
        </span>
        <span className="block text-muted">{visit.round.service?.name ?? visit.round.title}</span>
        <span className="flex items-center gap-1.5 text-muted">
          <UserRound aria-hidden className="size-4" />
          {who ? t("vendorSchedule.technician", { name: who }) : t("vendorSchedule.noTechnician")}
        </span>
        {visit.booking.problemNote && <span className="mt-1 block text-fg">“{visit.booking.problemNote}”</span>}
      </span>
      {visit.status === "SCHEDULED" && others.length > 0 && (
        <ConfirmAction
          action={reassignVisitAction}
          fields={{ visitId: visit.id }}
          trigger={t("vendorSchedule.change")}
          title={t("vendorSchedule.changeTitle")}
          body={t("vendorSchedule.changeBody", { flat, when: formatIST(visit.startsAt) })}
          confirm={t("vendorSchedule.move")}
        >
          <Field id={`tech-${visit.id}`} label={t("vendorSchedule.choose")}>
            {(aria) => (
              <Select {...aria} name="technicianId" required defaultValue={others[0].id}>
                {others.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </ConfirmAction>
      )}
    </li>
  );
}

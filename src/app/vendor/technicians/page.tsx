import { UserPlus, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatPhone } from "@/lib/phone";
import { addTechnicianAction, setTechnicianActiveAction } from "@/server/actions/vendor";
import { vendorTechnicians } from "@/server/vendor-schedule";

export const metadata: Metadata = { title: t("technicians.title") };

export default function TechniciansPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Technicians />
    </Suspense>
  );
}

/** A vendor's technicians, and adding one: the only way a technician account is created. */
async function Technicians() {
  const user = await requirePortal("vendor");
  const team = await vendorTechnicians(user.vendor.id);
  return (
    <div className="space-y-5">
      <PageHeader title={t("technicians.title")} subtitle={t("technicians.intro")} />
      <Card labelledBy="add-tech-title">
        <CardHeader titleId="add-tech-title" title={t("technicians.addTitle")} />
        <ActionForm action={addTechnicianAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field id="tech-name" label={t("technicians.name")}>
            {(aria) => <Input {...aria} name="name" required minLength={2} maxLength={60} autoComplete="off" />}
          </Field>
          <Field id="tech-phone" label={t("technicians.phone")}>
            {(aria) => <Input {...aria} name="phone" type="tel" inputMode="numeric" required autoComplete="off" placeholder="98765 43210" />}
          </Field>
          <SubmitButton icon={<UserPlus aria-hidden className="size-4" />}>{t("technicians.add")}</SubmitButton>
        </ActionForm>
      </Card>
      <section aria-labelledby="team">
        <SectionTitle>
          <span id="team">{t("technicians.listHeading", { n: team.length })}</span>
        </SectionTitle>
        {team.length === 0 ? (
          <EmptyState icon={<Wrench aria-hidden className="size-6" />} title={t("technicians.none")} body={t("technicians.noneBody")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {team.map((tech) => {
              const off = tech.deactivatedAt !== null;
              return (
                <li key={tech.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
                      {tech.name}
                      {off && <Badge>{t("technicians.off")}</Badge>}
                    </span>
                    <span className="block text-muted tabular-nums">{formatPhone(tech.phone)}</span>
                    {!off && <span className="block text-muted">{t("technicians.upcoming", { n: tech.upcoming })}</span>}
                  </span>
                  {off ? (
                    <ActionForm action={setTechnicianActiveAction}>
                      <input type="hidden" name="technicianId" value={tech.id} />
                      <input type="hidden" name="active" value="true" />
                      <SubmitButton variant="secondary" size="sm">
                        {t("technicians.turnOn")}
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <ConfirmAction
                      action={setTechnicianActiveAction}
                      fields={{ technicianId: tech.id, active: "false" }}
                      trigger={t("technicians.turnOff")}
                      title={t("technicians.turnOffTitle", { name: tech.name ?? "" })}
                      body={t("technicians.turnOffBody")}
                      confirm={t("technicians.turnOff")}
                      danger
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

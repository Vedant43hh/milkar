import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ServiceForm, type ServiceValues } from "@/components/vendor/catalogue-forms";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { GST_RATES_BPS } from "@/lib/vendor/catalogue";
import { rupeesText } from "@/lib/vendor/tier-editor";
import { removeSlotAction, saveSlotAction, setOfferedAction } from "@/server/actions/vendor";
import { getService, vendorCatalogue } from "@/server/catalogue";

export const metadata: Metadata = { title: t("catalogue.title") };

export default function ServicePage({ params }: PageProps<"/vendor/catalogue/services/[serviceId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Service params={params} />
    </Suspense>
  );
}

async function Service({ params }: { params: PageProps<"/vendor/catalogue/services/[serviceId]">["params"] }) {
  const user = await requirePortal("vendor");
  const { serviceId } = await params;
  const catalogue = await vendorCatalogue(user.vendor.id);
  if (catalogue.serviceCategories.length === 0) notFound();
  const service = serviceId === "new" ? null : await getService(user.vendor.id, serviceId);
  if (serviceId !== "new" && !service) notFound();

  const initial: ServiceValues = service
    ? {
        serviceId: service.id,
        name: service.name,
        category: service.category,
        description: service.description,
        minFlats: String(service.minFlats),
        fee: rupeesText(service.noAccessFeePaise),
        durationMinutes: String(service.durationMinutes),
        gstBps: String(service.gstBps),
        weeklyByDefault: service.weeklyByDefault,
      }
    : { serviceId: "new", name: "", category: catalogue.serviceCategories[0], description: "", minFlats: "10", fee: rupeesText(catalogue.defaultFeePaise), durationMinutes: "60", gstBps: "1800", weeklyByDefault: false };
  // A service already set up in a category the vendor no longer lists stays editable in it.
  const categories = [...new Set([...catalogue.serviceCategories, ...(service ? [service.category] : [])])];

  return (
    <div className="space-y-5">
      <Link href="/vendor/catalogue" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("catalogue.back")}
      </Link>
      <PageHeader title={service ? service.name : t("catalogue.newService")} />
      <Card>
        <ServiceForm initial={initial} categories={categories.map((c) => ({ value: c, label: t(`serviceCategories.${c}`) }))} gstRates={GST_RATES_BPS} text={messages().catalogue} />
      </Card>

      {service && (
        <>
          <Card labelledBy="options-title">
            <CardHeader
              titleId="options-title"
              title={t("catalogue.options")}
              action={
                <ButtonLink href={`/vendor/catalogue/services/${service.id}/options/new`} variant="secondary" size="sm" icon={<Plus aria-hidden className="size-4" />}>
                  {t("catalogue.addOption")}
                </ButtonLink>
              }
            />
            {service.options.length === 0 ? (
              <p className="text-sm text-muted">{t("catalogue.noOptions")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {service.options.map((o) => (
                  <li key={o.id}>
                    <Link href={`/vendor/catalogue/services/${service.id}/options/${o.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
                          {o.name}
                          {!o.active && <Badge>{t("catalogue.notOffered")}</Badge>}
                        </span>
                        <span className="block text-muted tabular-nums">
                          {o.tiers
                            .map((tier, i) =>
                              i === 0 ? t("catalogue.yourPrice", { price: formatINR(tier.vendorPricePaise) }) : t("catalogue.ladderFrom", { price: formatINR(tier.vendorPricePaise), n: tier.minFlats }),
                            )
                            .join(" → ")}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-brand">{t("catalogue.edit")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card labelledBy="slots-title">
            <CardHeader titleId="slots-title" title={t("catalogue.slots")} subtitle={t("catalogue.slotsIntro")} />
            <ul className="space-y-3">
              {service.slotTemplates.map((slot) => (
                <li key={slot.id} className="rounded-control border border-border p-3">
                  <SlotFields serviceId={service.id} templateId={slot.id} start={slot.startTime} end={slot.endTime} technicians={slot.technicians} label={t("catalogue.slotLabel", { start: slot.startTime, end: slot.endTime })} />
                  <ActionForm action={removeSlotAction} className="mt-2">
                    <input type="hidden" name="templateId" value={slot.id} />
                    <SubmitButton variant="ghost" size="sm" icon={<Trash2 aria-hidden className="size-4" />}>
                      {t("catalogue.removeSlot")}
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
              <li className="rounded-control border border-dashed border-border-strong p-3">
                <SlotFields serviceId={service.id} templateId="new" start="" end="" technicians={1} label={t("catalogue.addSlot")} />
              </li>
            </ul>
          </Card>

          {service.active ? (
            <ConfirmAction
              action={setOfferedAction}
              fields={{ kind: "service", id: service.id, active: "false" }}
              trigger={t("catalogue.stopOffering")}
              title={t("catalogue.stopTitle", { name: service.name })}
              body={t("catalogue.stopBody")}
              confirm={t("catalogue.stopOffering")}
              danger
            />
          ) : (
            <ActionForm action={setOfferedAction}>
              <input type="hidden" name="kind" value="service" />
              <input type="hidden" name="id" value={service.id} />
              <input type="hidden" name="active" value="true" />
              <SubmitButton variant="secondary">{t("catalogue.offerAgain")}</SubmitButton>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}

/** One daily slot: start, end and technicians, saved on its own. */
function SlotFields({ serviceId, templateId, start, end, technicians, label }: { serviceId: string; templateId: string; start: string; end: string; technicians: number; label: string }) {
  const isNew = templateId === "new";
  return (
    <ActionForm action={saveSlotAction} className="space-y-2">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-fg">{label}</legend>
        <input type="hidden" name="serviceId" value={serviceId} />
        <input type="hidden" name="templateId" value={templateId} />
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("catalogue.start")}</span>
            <Input type="time" name="startTime" required defaultValue={start} step={900} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("catalogue.end")}</span>
            <Input type="time" name="endTime" required defaultValue={end} step={900} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t("catalogue.technicians")}</span>
            <Input type="number" name="technicians" required min={1} max={50} inputMode="numeric" defaultValue={technicians} />
          </label>
        </div>
      </fieldset>
      <SubmitButton variant={isNew ? "primary" : "secondary"} size="sm" icon={isNew ? <Plus aria-hidden className="size-4" /> : undefined}>
        {isNew ? t("catalogue.addSlot") : t("catalogue.saveSlot")}
      </SubmitButton>
    </ActionForm>
  );
}

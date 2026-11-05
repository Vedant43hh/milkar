import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, PageHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PageSkeleton } from "@/components/ui/skeleton";
import { OptionForm, type OptionValues } from "@/components/vendor/catalogue-forms";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { rupeesText, tierRowsFor } from "@/lib/vendor/tier-editor";
import { setOfferedAction } from "@/server/actions/vendor";
import { getService, vendorCatalogue } from "@/server/catalogue";

export const metadata: Metadata = { title: t("catalogue.title") };

export default function OptionPage({ params }: PageProps<"/vendor/catalogue/services/[serviceId]/options/[optionId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Option params={params} />
    </Suspense>
  );
}

async function Option({ params }: { params: PageProps<"/vendor/catalogue/services/[serviceId]/options/[optionId]">["params"] }) {
  const user = await requirePortal("vendor");
  const { serviceId, optionId } = await params;
  const [service, catalogue] = await Promise.all([getService(user.vendor.id, serviceId), vendorCatalogue(user.vendor.id)]);
  if (!service) notFound();
  const option = optionId === "new" ? null : (service.options.find((o) => o.id === optionId) ?? null);
  if (optionId !== "new" && !option) notFound();

  const initial: OptionValues = option
    ? {
        serviceId: service.id,
        optionId: option.id,
        name: option.name,
        unitLabel: option.unitLabel,
        mrp: rupeesText(option.mrpPaise),
        maxPerFlat: String(option.maxPerFlat),
        tiers: tierRowsFor(option.tiers.map((x) => ({ minQty: x.minFlats, vendorPricePaise: x.vendorPricePaise }))),
      }
    : { serviceId: service.id, optionId: "new", name: "", unitLabel: "unit", mrp: "", maxPerFlat: "2", tiers: tierRowsFor([]) };

  return (
    <div className="space-y-5">
      <Link href={`/vendor/catalogue/services/${service.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {service.name}
      </Link>
      <PageHeader title={option ? option.name : t("catalogue.newOption")} subtitle={service.name} />
      <Card>
        <OptionForm initial={initial} marginBps={catalogue.marginBps} gstBps={service.gstBps} text={messages().catalogue} />
      </Card>
      {option &&
        (option.active ? (
          <ConfirmAction
            action={setOfferedAction}
            fields={{ kind: "option", id: option.id, active: "false" }}
            trigger={t("catalogue.stopOffering")}
            title={t("catalogue.stopTitle", { name: option.name })}
            body={t("catalogue.stopBody")}
            confirm={t("catalogue.stopOffering")}
            danger
          />
        ) : (
          <ActionForm action={setOfferedAction}>
            <input type="hidden" name="kind" value="option" />
            <input type="hidden" name="id" value={option.id} />
            <input type="hidden" name="active" value="true" />
            <SubmitButton variant="secondary">{t("catalogue.offerAgain")}</SubmitButton>
          </ActionForm>
        ))}
    </div>
  );
}

import { BadgeCheck, ChevronRight, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ServiceRoundForm } from "@/components/manager/service-round-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { isRepairService } from "@/lib/categories";
import { defaultRoundDates } from "@/lib/polls";
import { unitWordsFor } from "@/lib/rounds";
import { formatINR } from "@/lib/pricing/money";
import { unitPrice } from "@/lib/pricing/price";
import { startOfIstDay, utcToIstDate, utcToIstLocal } from "@/lib/time";
import { currentSettings, listServices, type CatalogueService } from "@/server/rounds";

export const metadata: Metadata = { title: t("manager.newService") };

export default function NewServiceRoundPage({ searchParams }: PageProps<"/manager/rounds/new/service">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <NewServiceRound searchParams={searchParams} />
    </Suspense>
  );
}

function VendorLine({ service }: { service: CatalogueService }) {
  const { vendor } = service;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
      {vendor.name}
      {vendor.verificationStatus === "VERIFIED" && (
        <Badge tone="success" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
          {t("vendor.verified")}
        </Badge>
      )}
      {vendor.ratingCount > 0 && (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <Star aria-hidden className="size-3.5 fill-current text-accent" />
          {t("vendor.rating", { rating: (vendor.ratingSum / vendor.ratingCount).toFixed(1), count: vendor.ratingCount })}
        </span>
      )}
    </span>
  );
}

function priceLines(service: CatalogueService, marginBps: number): string[] {
  return service.options.map((o) => {
    const price = (vendorPaise: number) => formatINR(unitPrice(vendorPaise, marginBps, service.gstBps).totalPaise);
    const first = o.tiers[0];
    const best = o.tiers[o.tiers.length - 1];
    return t("manager.form.priceRange", { option: o.name, from: price(first.vendorPricePaise), to: t("manager.form.tierAt", { price: price(best.vendorPricePaise), qty: best.minFlats }) });
  });
}

type Kind = "home-services" | "repairs" | "subscriptions";

/** Which kind of group buy a service makes: a repair, a weekly subscription, or a home service. */
function kindOf(service: CatalogueService): Kind {
  if (isRepairService(service.category)) return "repairs";
  return service.weeklyByDefault ? "subscriptions" : "home-services";
}

const KIND_TEXT = {
  "home-services": { heading: "manager.newService", title: "manager.form.serviceTitle", kind: "HOME_SERVICES" },
  repairs: { heading: "manager.form.newRepair", title: "manager.form.repairTitle", kind: "REPAIRS" },
  subscriptions: { heading: "manager.form.newSubscription", title: "manager.form.subscriptionTitle", kind: "SUBSCRIPTIONS" },
} as const;

async function NewServiceRound({ searchParams }: { searchParams: PageProps<"/manager/rounds/new/service">["searchParams"] }) {
  const user = await requirePortal("manager");
  const now = new Date();
  const [params, services, settings] = await Promise.all([searchParams, listServices(), currentSettings()]);
  const chosen = typeof params.service === "string" ? services.find((s) => s.id === params.service) : undefined;
  const kind: Kind = chosen ? kindOf(chosen) : params.kind === "repairs" || params.kind === "subscriptions" ? params.kind : "home-services";
  const text = KIND_TEXT[kind];
  const units = unitWordsFor(user.staff.community.unitLabel).other;

  if (!chosen) {
    const offered = services.filter((s) => kindOf(s) === kind);
    return (
      <div>
        <PageHeader title={t(text.heading)} subtitle={t("manager.form.chooseServiceIntro")} />
        {offered.length === 0 && <EmptyState title={t("manager.form.noServices")} body={t("manager.form.noServicesBody")} />}
        <ul className="grid gap-3 md:grid-cols-2">
          {offered.map((service) => (
            <li key={service.id}>
              <Link
                href={`/manager/rounds/new/service?kind=${kind}&service=${service.id}`}
                className="group flex h-full items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-fg">{service.name}</span>
                  <VendorLine service={service} />
                  <span className="block text-sm text-muted">{t("manager.form.minFlats", { n: service.minFlats, units })}</span>
                  {priceLines(service, settings.marginBps).map((line) => (
                    <span key={line} className="block text-xs text-subtle tabular-nums">
                      {line}
                    </span>
                  ))}
                </span>
                <span className="sr-only">{t("manager.form.useService")}</span>
                <ChevronRight aria-hidden className="mt-1 size-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const visitsPerDay = chosen.slotTemplates.reduce((n, s) => n + s.technicians, 0);
  return (
    <div className="space-y-5">
      <PageHeader title={t(text.heading)} />
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="font-semibold text-fg">{chosen.name}</h2>
            <VendorLine service={chosen} />
          </div>
          <ButtonLink href={`/manager/rounds/new/service?kind=${kind}`} variant="ghost" size="sm">
            {t("manager.form.changeService")}
          </ButtonLink>
        </div>
        <p className="text-sm text-muted">{chosen.description}</p>
        <ul className="space-y-0.5 text-sm text-fg tabular-nums">
          {priceLines(chosen, settings.marginBps).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          {t("manager.form.minFlats", { n: chosen.minFlats, units })} · {t("manager.form.slotsPerDay", { slots: chosen.slotTemplates.length, visits: visitsPerDay })} ·{" "}
          {t("manager.form.visitFee", { fee: formatINR(chosen.noAccessFeePaise) })}
        </p>
      </Card>
      <ServiceRoundForm
        text={messages().manager}
        serviceId={chosen.id}
        defaults={{
          title: t(text.title, { service: chosen.name }),
          cutoffAt: utcToIstLocal(defaultRoundDates(now).cutoffAt),
          day1: utcToIstDate(startOfIstDay(now, 5)),
          repeatWeekly: chosen.weeklyByDefault,
        }}
      />
    </div>
  );
}

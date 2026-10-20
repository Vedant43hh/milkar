import { BadgeCheck, ChevronRight, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ServiceRoundForm } from "@/components/captain/service-round-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { messages, t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { defaultRoundDates } from "@/lib/polls";
import { unitWordsFor } from "@/lib/rounds";
import { formatINR } from "@/lib/pricing/money";
import { unitPrice } from "@/lib/pricing/price";
import { startOfIstDay, utcToIstDate, utcToIstLocal } from "@/lib/time";
import { currentSettings, listServices, type CatalogueService } from "@/server/rounds";

export const metadata: Metadata = { title: t("captain.newService") };

export default function NewServiceRoundPage({ searchParams }: PageProps<"/captain/rounds/new/service">) {
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
    return t("captain.form.priceRange", { option: o.name, from: price(first.vendorPricePaise), to: t("captain.form.tierAt", { price: price(best.vendorPricePaise), qty: best.minFlats }) });
  });
}

async function NewServiceRound({ searchParams }: { searchParams: PageProps<"/captain/rounds/new/service">["searchParams"] }) {
  const user = await requireArea("captain");
  const now = new Date();
  const [params, services, settings] = await Promise.all([searchParams, listServices(), currentSettings()]);
  const chosen = typeof params.service === "string" ? services.find((s) => s.id === params.service) : undefined;
  const units = unitWordsFor(user.flat.community.unitLabel).other;

  if (!chosen) {
    return (
      <div>
        <PageHeader title={t("captain.form.chooseService")} subtitle={t("captain.form.chooseServiceIntro")} />
        <ul className="grid gap-3 md:grid-cols-2">
          {services.map((service) => (
            <li key={service.id}>
              <Link
                href={`/captain/rounds/new/service?service=${service.id}`}
                className="group flex h-full items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-fg">{service.name}</span>
                  <VendorLine service={service} />
                  <span className="block text-sm text-muted">{t("captain.form.minFlats", { n: service.minFlats, units })}</span>
                  {priceLines(service, settings.marginBps).map((line) => (
                    <span key={line} className="block text-xs text-subtle tabular-nums">
                      {line}
                    </span>
                  ))}
                </span>
                <span className="sr-only">{t("captain.form.useService")}</span>
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
      <PageHeader title={t("captain.newService")} />
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="font-semibold text-fg">{chosen.name}</h2>
            <VendorLine service={chosen} />
          </div>
          <ButtonLink href="/captain/rounds/new/service" variant="ghost" size="sm">
            {t("captain.form.changeService")}
          </ButtonLink>
        </div>
        <p className="text-sm text-muted">{chosen.description}</p>
        <ul className="space-y-0.5 text-sm text-fg tabular-nums">
          {priceLines(chosen, settings.marginBps).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          {t("captain.form.minFlats", { n: chosen.minFlats, units })} · {t("captain.form.slotsPerDay", { slots: chosen.slotTemplates.length, visits: visitsPerDay })} ·{" "}
          {t("captain.form.visitFee", { fee: formatINR(chosen.noAccessFeePaise) })}
        </p>
      </Card>
      <ServiceRoundForm
        text={messages().captain}
        serviceId={chosen.id}
        defaults={{
          title: t("captain.form.serviceTitle", { service: chosen.name }),
          cutoffAt: utcToIstLocal(defaultRoundDates(now).cutoffAt),
          day1: utcToIstDate(startOfIstDay(now, 5)),
          repeatWeekly: chosen.weeklyByDefault,
        }}
      />
    </div>
  );
}

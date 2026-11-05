import { Clock, Package, Plus, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { vendorCatalogue } from "@/server/catalogue";

export const metadata: Metadata = { title: t("catalogue.title") };

export default function CataloguePage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Catalogue />
    </Suspense>
  );
}

/** "Your price ₹450 → ₹420 at 20+ → ₹400 at 50+", the vendor's own prices. */
function ladder(tiers: { min: number; paise: number }[]): string {
  return tiers.map((tier, i) => (i === 0 ? t("catalogue.yourPrice", { price: formatINR(tier.paise) }) : t("catalogue.ladderFrom", { price: formatINR(tier.paise), n: tier.min }))).join(" → ");
}

async function Catalogue() {
  const user = await requirePortal("vendor");
  const catalogue = await vendorCatalogue(user.vendor.id);
  const offersServices = catalogue.serviceCategories.length > 0;
  return (
    <div className="space-y-6">
      <PageHeader title={t("catalogue.title")} subtitle={t("catalogue.intro")} />

      {catalogue.sellsProducts && (
        <section aria-labelledby="products" className="space-y-3">
          <SectionTitle
            action={
              <ButtonLink href="/vendor/catalogue/products/new" variant="secondary" size="sm" icon={<Plus aria-hidden className="size-4" />}>
                {t("catalogue.addProduct")}
              </ButtonLink>
            }
          >
            <span id="products">{t("catalogue.products")}</span>
          </SectionTitle>
          {catalogue.products.length === 0 ? (
            <EmptyState icon={<Package aria-hidden className="size-6" />} title={t("catalogue.noProducts")} body={t("catalogue.noProductsBody")} />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {catalogue.products.map((p) => (
                <li key={p.id}>
                  <Link href={`/vendor/catalogue/products/${p.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
                        {p.name}
                        <span className="font-normal text-muted">· {t(`vendorOrders.unit.${p.unit}`, { n: p.packSize })}</span>
                        {!p.active && <Badge>{t("catalogue.notOffered")}</Badge>}
                      </span>
                      <span className="block text-muted tabular-nums">{ladder(p.tiers.map((x) => ({ min: x.minQty, paise: x.vendorPricePaise })))}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-brand">{t("catalogue.edit")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {offersServices && (
        <section aria-labelledby="services" className="space-y-3">
          <SectionTitle
            action={
              <ButtonLink href="/vendor/catalogue/services/new" variant="secondary" size="sm" icon={<Plus aria-hidden className="size-4" />}>
                {t("catalogue.addService")}
              </ButtonLink>
            }
          >
            <span id="services">{t("catalogue.services")}</span>
          </SectionTitle>
          {catalogue.services.length === 0 ? (
            <EmptyState icon={<Wrench aria-hidden className="size-6" />} title={t("catalogue.noServices")} body={t("catalogue.noServicesBody")} />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
              {catalogue.services.map((s) => (
                <li key={s.id}>
                  <Link href={`/vendor/catalogue/services/${s.id}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
                        {s.name}
                        {!s.active && <Badge>{t("catalogue.notOffered")}</Badge>}
                      </span>
                      <span className="block text-muted">
                        {t(`serviceCategories.${s.category}`)} · {t("catalogue.optionsCount", { n: s.options.filter((o) => o.active).length })}
                      </span>
                      <span className="flex items-center gap-1 text-muted">
                        <Clock aria-hidden className="size-3.5" />
                        {s.slotTemplates.length > 0 ? t("catalogue.slotsSummary", { n: s.slotTemplates.length }) : t("catalogue.noSlots")}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-brand">{t("catalogue.edit")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

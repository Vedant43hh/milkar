import type { Metadata } from "next";
import { Suspense } from "react";
import { GroceryRoundForm, type ProductGroup } from "@/components/captain/grocery-round-form";
import { PageHeader } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { defaultRoundDates } from "@/lib/polls";
import { formatINR } from "@/lib/pricing/money";
import { unitPrice } from "@/lib/pricing/price";
import { startOfIstDay, utcToIstLocal } from "@/lib/time";
import { currentSettings, listCatalogue } from "@/server/rounds";

export const metadata: Metadata = { title: t("captain.newGrocery") };

const HOUR = 3_600_000;

export default function NewGroceryRoundPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <NewGroceryRound />
    </Suspense>
  );
}

async function NewGroceryRound() {
  await requireArea("captain");
  const now = new Date();
  const [products, settings] = await Promise.all([listCatalogue(), currentSettings()]);

  const groups = new Map<string, ProductGroup>();
  for (const p of products) {
    const label = t(`categories.${p.category}`);
    const group = groups.get(label) ?? { label, products: [] };
    const prices = p.tiers.map((tier) => ({ minQty: tier.minQty, paise: unitPrice(tier.vendorPricePaise, settings.marginBps, p.gstBps).totalPaise }));
    const ladder = prices.map((price, i) => (i === 0 ? formatINR(price.paise) : t("captain.form.tierAt", { price: formatINR(price.paise), qty: price.minQty }))).join(" → ");
    group.products.push({
      id: p.id,
      name: ["KG", "G", "LITRE", "ML"].includes(p.unit) ? `${p.name} · ${p.packSize} ${t(`units.${p.unit}`)}` : p.name,
      detail: `${t("captain.form.vendor", { vendor: p.vendor.name })} · ${t("captain.form.minimum", { n: p.minOrderQty })}`,
      ladder,
      defaultCap: p.defaultMaxPerFlat,
    });
    groups.set(label, group);
  }

  const { cutoffAt } = defaultRoundDates(now);
  return (
    <div>
      <PageHeader title={t("captain.newGrocery")} subtitle={t("captain.groceryCardBody")} />
      <GroceryRoundForm
        groups={[...groups.values()]}
        defaults={{ title: "", cutoffAt: utcToIstLocal(cutoffAt), deliveryAt: utcToIstLocal(new Date(startOfIstDay(now, 5).getTime() + 10 * HOUR)) }}
      />
    </div>
  );
}

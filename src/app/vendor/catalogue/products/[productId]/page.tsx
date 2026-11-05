import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, PageHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ProductForm, type ProductValues } from "@/components/vendor/catalogue-forms";
import { messages, t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { GST_RATES_BPS, PRODUCT_CATEGORIES, UNITS } from "@/lib/vendor/catalogue";
import { rupeesText, tierRowsFor } from "@/lib/vendor/tier-editor";
import { setOfferedAction } from "@/server/actions/vendor";
import { getProduct, vendorCatalogue } from "@/server/catalogue";

export const metadata: Metadata = { title: t("catalogue.title") };

export default function ProductPage({ params }: PageProps<"/vendor/catalogue/products/[productId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: { params: PageProps<"/vendor/catalogue/products/[productId]">["params"] }) {
  const user = await requirePortal("vendor");
  const { productId } = await params;
  const catalogue = await vendorCatalogue(user.vendor.id);
  if (!catalogue.sellsProducts) notFound();
  const product = productId === "new" ? null : await getProduct(user.vendor.id, productId);
  if (productId !== "new" && !product) notFound();

  const initial: ProductValues = product
    ? {
        productId: product.id,
        name: product.name,
        category: product.category,
        unit: product.unit,
        packSize: String(product.packSize),
        mrp: rupeesText(product.mrpPaise),
        gstBps: String(product.gstBps),
        minOrderQty: String(product.minOrderQty),
        maxPerFlat: String(product.defaultMaxPerFlat),
        tiers: tierRowsFor(product.tiers),
      }
    : { productId: "new", name: "", category: PRODUCT_CATEGORIES[0], unit: "KG", packSize: "1", mrp: "", gstBps: "500", minOrderQty: "10", maxPerFlat: "4", tiers: tierRowsFor([]) };

  return (
    <div className="space-y-5">
      <Link href="/vendor/catalogue" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("catalogue.back")}
      </Link>
      <PageHeader title={product ? product.name : t("catalogue.newProduct")} />
      <Card>
        <ProductForm
          initial={initial}
          categories={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
          units={UNITS.map((u) => ({ value: u, label: t(`units.${u}`) }))}
          gstRates={GST_RATES_BPS}
          marginBps={catalogue.marginBps}
          text={messages().catalogue}
        />
      </Card>
      {product &&
        (product.active ? (
          <ConfirmAction
            action={setOfferedAction}
            fields={{ kind: "product", id: product.id, active: "false" }}
            trigger={t("catalogue.stopOffering")}
            title={t("catalogue.stopTitle", { name: product.name })}
            body={t("catalogue.stopBody")}
            confirm={t("catalogue.stopOffering")}
            danger
          />
        ) : (
          <ActionForm action={setOfferedAction}>
            <input type="hidden" name="kind" value="product" />
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="active" value="true" />
            <SubmitButton variant="secondary">{t("catalogue.offerAgain")}</SubmitButton>
          </ActionForm>
        ))}
    </div>
  );
}

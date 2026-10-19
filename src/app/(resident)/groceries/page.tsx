import { ShoppingBasket } from "lucide-react";
import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("placeholder.groceriesTitle") };

export default function Page() {
  return <PlaceholderPage area="resident" title="placeholder.groceriesTitle" body="placeholder.groceriesBody" icon={ShoppingBasket} />;
}

import { Package } from "lucide-react";
import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("placeholder.vendorOrdersTitle") };

export default function Page() {
  return <PlaceholderPage area="vendor" title="placeholder.vendorOrdersTitle" body="placeholder.vendorOrdersBody" icon={Package} />;
}

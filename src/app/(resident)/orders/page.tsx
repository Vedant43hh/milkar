import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("placeholder.ordersTitle") };

export default function Page() {
  return <PlaceholderPage area="resident" title="placeholder.ordersTitle" body="placeholder.ordersBody" icon={ReceiptText} />;
}

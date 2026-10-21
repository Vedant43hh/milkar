import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("placeholder.walletTitle") };

export default function Page() {
  return <PlaceholderPage portal="app" title="placeholder.walletTitle" body="placeholder.walletBody" icon={Wallet} />;
}

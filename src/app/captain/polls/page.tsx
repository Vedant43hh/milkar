import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("placeholder.pollsTitle") };

export default function Page() {
  return <PlaceholderPage area="captain" title="placeholder.pollsTitle" body="placeholder.pollsBody" icon={Megaphone} />;
}

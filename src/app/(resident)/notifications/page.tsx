import { Bell } from "lucide-react";
import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("placeholder.notificationsTitle") };

export default function Page() {
  return <PlaceholderPage area="resident" title="placeholder.notificationsTitle" body="placeholder.notificationsBody" icon={Bell} />;
}

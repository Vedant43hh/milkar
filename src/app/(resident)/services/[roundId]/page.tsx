import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("placeholder.serviceDayTitle") };

export default function Page() {
  return <PlaceholderPage area="resident" title="placeholder.serviceDayTitle" body="placeholder.serviceDayBody" icon={CalendarClock} />;
}

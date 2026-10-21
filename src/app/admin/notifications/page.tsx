import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationCentre } from "@/components/notifications/notification-centre";
import { ListSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("notifications.title") };

export default function AdminNotificationsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <NotificationCentre portal="admin" />
    </Suspense>
  );
}

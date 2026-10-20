import {
  BadgePercent,
  Bell,
  CalendarCheck,
  CalendarClock,
  CircleCheck,
  ClipboardList,
  DoorClosed,
  Lightbulb,
  Megaphone,
  MessageSquareWarning,
  Package,
  Timer,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/display";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import type { Area } from "@/lib/auth/rules";
import { relativeTime, renderNotification, type NotificationType } from "@/lib/notifications";
import { openNotificationAction } from "@/server/actions/notifications";
import { listNotifications } from "@/server/notifications";
import { MarkAllReadButton } from "./mark-all-read";

const ICONS: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  ROUND_OPENED: { icon: ClipboardList, tone: "bg-brand-soft text-brand-soft-fg" },
  TIER_UNLOCKED: { icon: BadgePercent, tone: "bg-accent-soft text-accent-soft-fg" },
  CUTOFF_REMINDER: { icon: Timer, tone: "bg-warning-soft text-warning" },
  ROUND_FINALIZED: { icon: CircleCheck, tone: "bg-success-soft text-success" },
  REFUND_CREDITED: { icon: Wallet, tone: "bg-success-soft text-success" },
  VISIT_SCHEDULED: { icon: CalendarCheck, tone: "bg-brand-soft text-brand-soft-fg" },
  TECHNICIAN_ON_THE_WAY: { icon: Truck, tone: "bg-brand-soft text-brand-soft-fg" },
  VISIT_COMPLETED: { icon: CircleCheck, tone: "bg-success-soft text-success" },
  VISIT_NO_ACCESS: { icon: DoorClosed, tone: "bg-warning-soft text-warning" },
  POLL_THRESHOLD: { icon: Megaphone, tone: "bg-accent-soft text-accent-soft-fg" },
  POLL_SUGGESTION: { icon: Lightbulb, tone: "bg-accent-soft text-accent-soft-fg" },
  SLOT_HELD: { icon: CalendarClock, tone: "bg-brand-soft text-brand-soft-fg" },
  SLOT_AUTO_BOOKED: { icon: CalendarCheck, tone: "bg-success-soft text-success" },
  ISSUE_UPDATE: { icon: MessageSquareWarning, tone: "bg-surface-2 text-muted" },
  VENDOR_ORDER: { icon: Package, tone: "bg-brand-soft text-brand-soft-fg" },
};

/** The notification list for the signed-in user. Reads the session: render inside <Suspense>. */
export async function NotificationCentre({ area }: { area: Area }) {
  const user = await requireArea(area);
  const now = new Date();
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title={t("notifications.title")}
        subtitle={unread > 0 ? t("notifications.unreadCount", { n: unread }) : t("notifications.intro")}
        action={unread > 0 && <MarkAllReadButton label={t("notifications.markAllRead")} />}
      />
      {items.length === 0 ? (
        <EmptyState icon={<Bell aria-hidden className="size-6" />} title={t("notifications.empty")} body={t("notifications.emptyBody")} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-card">
          {items.map((n) => {
            const { title, body } = renderNotification(n.type, n.params);
            const { icon: Icon, tone } = ICONS[n.type] ?? { icon: Bell, tone: "bg-surface-2 text-muted" };
            const isUnread = !n.readAt;
            return (
              <li key={n.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
                      isUnread && "bg-brand-soft/40",
                    )}
                  >
                    <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full", tone)}>
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-fg", isUnread ? "font-semibold" : "font-medium")}>{title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{body}</span>
                      <time dateTime={n.createdAt.toISOString()} className="mt-1 block text-xs text-subtle">
                        {relativeTime(n.createdAt, now)}
                      </time>
                    </span>
                    {isUnread && (
                      <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand">
                        <span className="sr-only">{t("notifications.unread")}</span>
                      </span>
                    )}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

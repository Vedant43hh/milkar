import {
  BadgeCheck,
  BadgePercent,
  IndianRupee,
  Repeat,
  Store,
  Building2,
  UserPlus,
  Users,
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
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/display";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import type { Portal } from "@/lib/auth/rules";
import { relativeTime, renderNotification, type NotificationType } from "@/lib/notifications";
import { openNotificationAction } from "@/server/actions/notifications";
import { listNotifications } from "@/server/notifications";
import { MarkAllReadButton } from "./mark-all-read";

const ICONS: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  ROUND_OPENED: { icon: ClipboardList, tone: "text-brand neu-pressed-xs" },
  TIER_UNLOCKED: { icon: BadgePercent, tone: "text-accent neu-pressed-xs" },
  CUTOFF_REMINDER: { icon: Timer, tone: "text-warning neu-pressed-xs" },
  ROUND_FINALIZED: { icon: CircleCheck, tone: "text-success neu-pressed-xs" },
  REFUND_CREDITED: { icon: Wallet, tone: "text-success neu-pressed-xs" },
  VISIT_SCHEDULED: { icon: CalendarCheck, tone: "text-brand neu-pressed-xs" },
  TECHNICIAN_ON_THE_WAY: { icon: Truck, tone: "text-brand neu-pressed-xs" },
  VISIT_COMPLETED: { icon: CircleCheck, tone: "text-success neu-pressed-xs" },
  VISIT_NO_ACCESS: { icon: DoorClosed, tone: "text-warning neu-pressed-xs" },
  POLL_THRESHOLD: { icon: Megaphone, tone: "text-accent neu-pressed-xs" },
  POLL_SUGGESTION: { icon: Lightbulb, tone: "text-accent neu-pressed-xs" },
  SLOT_HELD: { icon: CalendarClock, tone: "text-brand neu-pressed-xs" },
  SLOT_AUTO_BOOKED: { icon: CalendarCheck, tone: "text-success neu-pressed-xs" },
  ISSUE_UPDATE: { icon: MessageSquareWarning, tone: "text-muted neu-pressed-xs" },
  ISSUE_REPORTED: { icon: MessageSquareWarning, tone: "text-warning neu-pressed-xs" },
  PARTS_APPROVAL: { icon: Wrench, tone: "text-accent neu-pressed-xs" },
  MEMBER_REMOVED: { icon: Users, tone: "text-muted neu-pressed-xs" },
  PAYOUT_PAID: { icon: IndianRupee, tone: "text-success neu-pressed-xs" },
  SUBSCRIPTION_ORDERED: { icon: Repeat, tone: "text-success neu-pressed-xs" },
  SUBSCRIPTION_CONFIRM: { icon: Repeat, tone: "text-accent neu-pressed-xs" },
  VENDOR_ORDER: { icon: Package, tone: "text-brand neu-pressed-xs" },
  JOIN_REQUEST: { icon: UserPlus, tone: "text-accent neu-pressed-xs" },
  JOIN_DECIDED: { icon: Users, tone: "text-success neu-pressed-xs" },
  COMMUNITY_DECIDED: { icon: Building2, tone: "text-success neu-pressed-xs" },
  VENDOR_DECIDED: { icon: BadgeCheck, tone: "text-success neu-pressed-xs" },
  COMMUNITY_REGISTERED: { icon: Building2, tone: "text-accent neu-pressed-xs" },
  VENDOR_REGISTERED: { icon: Store, tone: "text-accent neu-pressed-xs" },
};

/** The notification list for the signed-in user. Reads the session: render inside <Suspense>. */
export async function NotificationCentre({ portal }: { portal: Portal }) {
  const user = await requirePortal(portal);
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
        <ul className="divide-y divide-border overflow-hidden rounded-card bg-surface shadow-card">
          {items.map((n) => {
            const { title, body } = renderNotification(n.type, n.params);
            const { icon: Icon, tone } = ICONS[n.type] ?? { icon: Bell, tone: "text-muted neu-pressed-xs" };
            const isUnread = !n.readAt;
            return (
              <li key={n.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-[box-shadow] duration-200 ease-in-out hover:neu-pressed-xs",
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

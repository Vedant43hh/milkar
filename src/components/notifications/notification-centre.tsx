import { PageHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/display";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import type { Portal } from "@/lib/auth/rules";
import { relativeTime, renderNotification } from "@/lib/notifications";
import { openNotificationAction } from "@/server/actions/notifications";
import { listNotifications } from "@/server/notifications";
import { MarkAllReadButton } from "./mark-all-read";

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
        <EmptyState title={t("notifications.empty")} body={t("notifications.emptyBody")} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {items.map((n) => {
            const { title, body } = renderNotification(n.type, n.params);
            const isUnread = !n.readAt;
            return (
              <li key={n.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    type="submit"
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-fg", isUnread ? "font-semibold" : "font-medium")}>{title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{body}</span>
                      <time dateTime={n.createdAt.toISOString()} className="mt-1 block text-sm text-muted">
                        {relativeTime(n.createdAt, now)}
                      </time>
                    </span>
                    {isUnread && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent">
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

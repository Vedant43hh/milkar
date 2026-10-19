import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { renderNotification, type NotificationMessage, type NotificationType } from "@/lib/notifications";

type Db = PrismaClient | Prisma.TransactionClient;

export type StoredNotification = {
  id: string;
  userId: string;
  type: NotificationType;
  params: Prisma.JsonValue;
  href: string | null;
};

/** A way of reaching a resident. In-app is the database row itself; push and SMS are stubs for now. */
export interface NotificationChannel {
  readonly name: string;
  deliver(notifications: readonly StoredNotification[]): Promise<void>;
}

class LoggingStubChannel implements NotificationChannel {
  constructor(readonly name: "push" | "sms") {}

  async deliver(notifications: readonly StoredNotification[]): Promise<void> {
    if (getEnv().NOTIFY_STUBS !== "log") return;
    for (const n of notifications) {
      const { title } = renderNotification(n.type, n.params);
      console.info(`[notify:${this.name}] user ${n.userId}: ${title}`);
    }
  }
}

const channels: NotificationChannel[] = [new LoggingStubChannel("push"), new LoggingStubChannel("sms")];

/**
 * Stores one notification per recipient and hands the new ones to the push/SMS channels. With a
 * dedupeKey, a recipient who already has that key is skipped, so retries and races notify once.
 * Returns the notifications that were actually created.
 */
export async function notify<T extends NotificationType>(
  db: Db,
  userIds: readonly string[],
  message: NotificationMessage<T>,
  options: { dedupeKey?: string; now?: Date } = {},
): Promise<StoredNotification[]> {
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return [];
  const created = await db.notification.createManyAndReturn({
    data: recipients.map((userId) => ({
      userId,
      type: message.type,
      params: message.params as Prisma.InputJsonObject,
      href: message.href ?? null,
      dedupeKey: options.dedupeKey ?? null,
      createdAt: options.now,
    })),
    skipDuplicates: true,
    select: { id: true, userId: true, type: true, params: true, href: true },
  });
  if (created.length > 0) {
    await Promise.all(channels.map((channel) => channel.deliver(created)));
  }
  return created;
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, take = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: { id: true, type: true, params: true, href: true, readAt: true, createdAt: true },
  });
}

export async function markAllRead(userId: string, now: Date): Promise<number> {
  const { count } = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
  return count;
}

/** Marks one of the user's own notifications read and returns where it points, or null if it isn't theirs. */
export async function markRead(userId: string, id: string, now: Date): Promise<{ href: string | null } | null> {
  const notification = await prisma.notification.findFirst({ where: { id, userId }, select: { href: true, readAt: true } });
  if (!notification) return null;
  if (!notification.readAt) await prisma.notification.update({ where: { id }, data: { readAt: now } });
  return { href: notification.href };
}

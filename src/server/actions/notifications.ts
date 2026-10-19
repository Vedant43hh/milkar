"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { safeNotificationHref } from "@/lib/notifications";
import { markAllRead, markRead } from "@/server/notifications";

/** Where the notification centre lives for each kind of user. */
function centrePath(role: string): string {
  if (role === "VENDOR") return "/vendor/notifications";
  if (role === "ADMIN") return "/admin/notifications";
  return "/notifications";
}

export type MarkAllReadState = { runs: number; marked: number };

/** Stays on the page: refreshes it so the list and the bell update, and lets the button show a toast. */
export async function markAllReadAction(prev: MarkAllReadState): Promise<MarkAllReadState> {
  const user = await requireUser();
  const marked = await markAllRead(user.id, new Date());
  refresh();
  return { runs: prev.runs + 1, marked };
}

/** Opens a notification: marks it read, then follows its link (same-site paths only). */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const result = await markRead(user.id, String(formData.get("id") ?? ""), new Date());
  const href = result?.href ? safeNotificationHref(result.href) : centrePath(user.role);
  redirect(href === "/notifications" ? centrePath(user.role) : href);
}

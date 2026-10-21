"use server";

import { refresh } from "next/cache";
import { t, type MessageKey } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortalUser } from "@/lib/auth/current-user";
import { cancelJoinRequest, requestToJoin, type JoinError } from "@/server/registration";

// A resident account waiting for (or without) a flat: ask to join one, or withdraw the request.

const errorKey = (code: JoinError): MessageKey => `joinRequest.errors.${code}`;

export async function requestJoinAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortalUser("app");
  const result = await requestToJoin(user.id, { communityId: String(formData.get("communityId") ?? ""), flatId: String(formData.get("flatId") ?? "") }, new Date());
  if (!result.ok) return { ok: false, message: t(errorKey(result.error)) };
  refresh();
  return { ok: true, message: t("joinRequest.sent") };
}

export async function cancelJoinAction(): Promise<ActionResult> {
  const user = await requirePortalUser("app");
  await cancelJoinRequest(user.id);
  refresh();
  return { ok: true, message: t("joinRequest.cancelled") };
}

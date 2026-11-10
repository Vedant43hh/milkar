"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { t, type MessageKey } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { changeSubscription, keepOrderWeekly, orderThisWeek, setSubscriptionAutoPay } from "@/server/subscriptions";

// A resident's weekly standing orders.

async function shopper() {
  const user = await requirePortal("app");
  return { id: user.id, flatId: user.flatId, communityId: user.flat.community.id };
}

export async function keepOrderWeeklyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const result = await keepOrderWeekly(await shopper(), String(formData.get("roundId") ?? ""), { autoPayFromWallet: formData.get("autoPayFromWallet") === "on" });
  if (!result.ok) return { ok: false, message: t(`subscriptions.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("subscriptions.kept") };
}

export async function changeSubscriptionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await shopper();
  const change = String(formData.get("change") ?? "");
  if (change !== "PAUSE" && change !== "RESUME" && change !== "CANCEL") return { ok: false, message: t("subscriptions.errors.NOT_ALLOWED") };
  const result = await changeSubscription(me.id, String(formData.get("id") ?? ""), change);
  if (!result.ok) return { ok: false, message: t(`subscriptions.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t(change === "PAUSE" ? "subscriptions.paused" : change === "RESUME" ? "subscriptions.resumed" : "subscriptions.cancelled") };
}

export async function setAutoPayAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await shopper();
  const on = formData.get("autoPayFromWallet") === "on";
  if (!(await setSubscriptionAutoPay(me.id, String(formData.get("id") ?? ""), on))) return { ok: false, message: t("subscriptions.errors.NOT_FOUND") };
  refresh();
  return { ok: true, message: t(on ? "subscriptions.autoPayOn" : "subscriptions.autoPayOff") };
}

/** Orders this week's usual items now: paid from the wallet, or on to the payment screen. */
export async function orderThisWeekAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const result = await orderThisWeek(await shopper(), String(formData.get("id") ?? ""), new Date());
  if (result.status === "NOT_FOUND") return { ok: false, message: t("subscriptions.errors.NOT_FOUND") };
  // The test payment screen handles the rest; with Razorpay the group buy page takes the payment.
  if (result.status === "AWAITING_PAYMENT") redirect(result.provider === "MOCK" ? `/app/pay/${result.paymentId}` : `/app/groceries?round=${result.roundId}`);
  if (result.status === "REJECTED") {
    const texts = result.errors.map((e) => t(`shop.errors.${e.code}` as MessageKey, { item: (e.offeringId && result.names[e.offeringId]) || "", max: "maxAllowed" in e ? (e.maxAllowed ?? 0) : 0 }));
    return { ok: false, message: [...new Set(texts)].join(" ") };
  }
  refresh();
  return { ok: true, message: t("subscriptions.orderedNow") };
}

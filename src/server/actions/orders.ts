"use server";

import { refresh } from "next/cache";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { approveParts, declineParts } from "@/server/parts";
import { removeProblemPhoto, saveProblemNote, saveProblemPhoto } from "@/server/repairs";
import { rateVisit, reportVisitIssue } from "@/server/visit-feedback";
import type { CheckoutOutcome } from "./shop";

// A resident's say on a visit to their flat: a rating, a complaint within 48 hours, the problem
// to fix, and the parts the technician asks for.

export async function rateVisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("app");
  const result = await rateVisit(
    user,
    { visitId: String(formData.get("visitId") ?? ""), rating: Number(formData.get("rating")), comment: String(formData.get("comment") ?? "") },
    new Date(),
  );
  if (!result.ok) return { ok: false, message: t(`orders.rating.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("orders.rating.thanks") };
}

export async function reportIssueAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("app");
  const result = await reportVisitIssue(user, { visitId: String(formData.get("visitId") ?? ""), note: String(formData.get("note") ?? "") }, new Date());
  if (!result.ok) return { ok: false, message: t(`orders.report.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("orders.report.sent") };
}

/** Approving parts pays for them: done at once from the wallet, or on to UPI for the rest. */
export async function approvePartsAction(requestId: string): Promise<CheckoutOutcome> {
  const user = await requirePortal("app");
  const result = await approveParts(user, String(requestId), new Date());
  if (result.status === "REJECTED") return { status: "ERROR", errors: [t(`parts.errors.${result.error}`)] };
  if (result.status === "PAID") {
    refresh();
    return { status: "DONE", message: t("parts.paid"), celebrate: null };
  }
  if (result.provider === "RAZORPAY") {
    return {
      status: "RAZORPAY",
      keyId: getEnv().RAZORPAY_KEY_ID ?? "",
      orderId: result.providerOrderId,
      paymentId: result.paymentId,
      amountPaise: result.gatewayPaise,
      description: t("parts.razorpayDescription"),
      contact: user.phone,
    };
  }
  return { status: "REDIRECT", url: `/app/pay/${result.paymentId}` };
}

export async function declinePartsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("app");
  const result = await declineParts(user, String(formData.get("requestId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`parts.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("parts.declined") };
}

/** What's wrong: the note, and a photo already shrunk on the phone (or a request to remove it). */
export async function saveProblemAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("app");
  const roundId = String(formData.get("roundId") ?? "");
  const now = new Date();
  const note = await saveProblemNote(user, roundId, String(formData.get("note") ?? ""));
  if (!note.ok) return { ok: false, message: t(`problem.errors.${note.error}`) };
  const photo = formData.get("photo");
  if (formData.get("removePhoto") === "1") {
    await removeProblemPhoto(user, roundId);
  } else if (photo instanceof File && photo.size > 0) {
    const saved = await saveProblemPhoto(
      user,
      roundId,
      { bytes: new Uint8Array(await photo.arrayBuffer()), width: Number(formData.get("width")), height: Number(formData.get("height")) },
      now,
    );
    if (!saved.ok) return { ok: false, message: t(`problem.errors.${saved.error}`) };
  }
  refresh();
  return { ok: true, message: t("problem.saved") };
}

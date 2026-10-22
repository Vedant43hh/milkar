"use server";

import { refresh } from "next/cache";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { rateVisit, reportVisitIssue } from "@/server/visit-feedback";

// A resident's feedback on a visit to their flat: a rating, or a complaint within 48 hours.

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

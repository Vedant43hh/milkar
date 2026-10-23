"use server";

import { refresh } from "next/cache";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { returnUnusedParts, requestParts } from "@/server/parts";
import { moveVisit } from "@/server/visits";

// A technician working through a visit: on the way, started, parts, the resident's code, done.
// Only their own visits; the server checks every step.

const STEPS = ["ON_THE_WAY", "IN_PROGRESS", "COMPLETED", "NO_ACCESS"] as const;
type Step = (typeof STEPS)[number];

export async function moveVisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("tech");
  const to = String(formData.get("to") ?? "") as Step;
  if (!STEPS.includes(to)) return { ok: false, message: t("techVisit.errors.INVALID_TRANSITION") };
  const result = await moveVisit(
    { id: user.id, role: user.role, name: user.name, vendorId: user.vendor.id, managesCommunityId: null },
    String(formData.get("visitId") ?? ""),
    { to, code: String(formData.get("code") ?? "") || undefined },
    new Date(),
  );
  if (!result.ok) {
    if (result.error === "WRONG_CODE") return { ok: false, message: t("techVisit.errors.WRONG_CODE", { n: result.attemptsLeft ?? 0 }) };
    return { ok: false, message: t(`techVisit.errors.${result.error}`) };
  }
  refresh();
  return { ok: true, message: t(`techVisit.done.${result.status}`) };
}

/** The parts form posts rows as name[], qty[] and price[] (rupees). */
export async function requestPartsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("tech");
  const names = formData.getAll("name").map(String);
  const qtys = formData.getAll("qty").map(String);
  const prices = formData.getAll("price").map(String);
  const rows = names.map((name, i) => ({
    name,
    qty: qtys[i] ? Number(qtys[i]) : 0,
    // Rupees with up to two decimals, as typed; anything else fails the check.
    unitPaise: prices[i] && /^\d+(\.\d{1,2})?$/.test(prices[i].trim()) ? Math.round(Number(prices[i]) * 100) : prices[i]?.trim() ? NaN : 0,
  }));
  const result = await requestParts({ id: user.id, role: user.role, name: user.name }, String(formData.get("visitId") ?? ""), rows, new Date());
  if (!result.ok) return { ok: false, message: t(`techVisit.parts.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("techVisit.parts.sent") };
}

export async function returnPartsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("tech");
  const result = await returnUnusedParts({ id: user.id, role: user.role }, String(formData.get("requestId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`techVisit.parts.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("techVisit.parts.returned") };
}

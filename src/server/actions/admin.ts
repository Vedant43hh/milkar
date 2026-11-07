"use server";

import { refresh } from "next/cache";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { normalizeIndianMobile } from "@/lib/phone";
import { formatINR } from "@/lib/pricing/money";
import { istLocalToUtc } from "@/lib/time";
import { createAdmin, markPayoutPaid, savePlatformSettings } from "@/server/admin";
import { resolveServiceIssue } from "@/server/issues";
import { decideCommunity, decideVendor } from "@/server/registration";
import { actorOf } from "@/server/rounds";

// Platform admins approve the communities and verify the vendors that registered.

const decisionOf = (formData: FormData) => (formData.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED");

export async function decideCommunityAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("admin");
  const decision = decisionOf(formData);
  const result = await decideCommunity(actorOf(user), String(formData.get("communityId") ?? ""), decision, String(formData.get("note") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`approvals.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t(decision === "APPROVED" ? "approvals.communityApproved" : "approvals.communityDeclined") };
}

export async function decideVendorAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("admin");
  const decision = decisionOf(formData);
  const result = await decideVendor(actorOf(user), String(formData.get("vendorId") ?? ""), decision, String(formData.get("note") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`approvals.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t(decision === "APPROVED" ? "approvals.vendorVerified" : "approvals.vendorDeclined") };
}

// ---------- disputes, payouts, settings and other admins ----------

export async function resolveDisputeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("admin");
  const resolution = String(formData.get("resolution") ?? "");
  if (resolution !== "REVISIT" && resolution !== "REFUND" && resolution !== "REJECT") return { ok: false, message: t("issues.errors.NOT_ALLOWED") };
  const raw = String(formData.get("revisitAt") ?? "");
  let revisitAt: Date | null = null;
  if (resolution === "REVISIT") {
    try {
      revisitAt = istLocalToUtc(raw);
    } catch {
      revisitAt = null;
    }
  }
  const result = await resolveServiceIssue(actorOf(user), String(formData.get("issueId") ?? ""), { resolution, revisitAt, note: String(formData.get("note") ?? "") }, new Date());
  if (!result.ok) return { ok: false, message: t(`issues.errors.${result.error}`) };
  refresh();
  if (resolution === "REFUND") return { ok: true, message: t("issues.refunded", { amount: formatINR(result.refundedPaise) }) };
  return { ok: true, message: t(resolution === "REVISIT" ? "issues.revisitBooked" : "issues.closed") };
}

export async function markPaidAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("admin");
  const result = await markPayoutPaid(actorOf(user), String(formData.get("orderId") ?? ""), new Date());
  if (!result.ok) return { ok: false, message: t(`adminPayouts.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("adminPayouts.marked", { amount: formatINR(result.amountPaise) }) };
}

/** A decimal typed by a person, scaled to a whole number (e.g. "2.5" × 100 = 250), or NaN. */
function scaled(formData: FormData, key: string, by: number): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(raw)) return Number.NaN;
  return Math.round(Number(raw) * by);
}

export async function saveSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("admin");
  const settings = {
    marginBps: scaled(formData, "margin", 100),
    reductionFreezeMinutes: scaled(formData, "freezeHours", 60),
    defaultNoAccessFeePaise: scaled(formData, "fee", 100),
    impactMetresPerTrip: scaled(formData, "kmPerTrip", 1000),
    impactMlPerKm: scaled(formData, "litresPerKm", 1000),
    impactGramsCo2PerLitre: scaled(formData, "co2PerLitre", 1000),
  };
  const result = await savePlatformSettings(actorOf(user), settings);
  if (!result.ok) return { ok: false, message: [...new Set(result.errors.map((e) => t(`adminSettings.errors.${e}`)))].join(" ") };
  refresh();
  return { ok: true, message: t("adminSettings.saved") };
}

export async function createAdminAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("admin");
  const phone = normalizeIndianMobile(String(formData.get("phone") ?? ""));
  if (!phone) return { ok: false, message: t("errors.invalidPhone") };
  const result = await createAdmin(actorOf(user), { name: String(formData.get("name") ?? ""), phone }, new Date());
  if (!result.ok) return { ok: false, message: t(`adminAdmins.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("adminAdmins.added") };
}

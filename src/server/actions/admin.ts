"use server";

import { refresh } from "next/cache";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
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

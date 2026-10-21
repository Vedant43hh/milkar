"use server";

import { refresh } from "next/cache";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { requirePortal } from "@/lib/auth/current-user";
import { normalizeIndianMobile } from "@/lib/phone";
import { addTechnician } from "@/server/registration";

/** A vendor adds a technician by phone and name; the technician then logs in with that phone. */
export async function addTechnicianAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requirePortal("vendor");
  const phone = normalizeIndianMobile(String(formData.get("phone") ?? ""));
  if (!phone) return { ok: false, message: t("errors.invalidPhone") };
  const result = await addTechnician({ role: user.role, vendorId: user.vendor.id }, { phone, name: String(formData.get("name") ?? "") }, new Date());
  if (!result.ok) return { ok: false, message: t(`technicians.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("technicians.added") };
}

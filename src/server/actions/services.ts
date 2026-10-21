"use server";

import { refresh } from "next/cache";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { changeSlot, setBookingPreferences } from "@/server/bookings";

export type ServiceActionResult = { ok: boolean; message: string };

/** Moves the flat's visit to another slot of the same Service Day. */
export async function changeSlotAction(roundId: string, slotId: string, slotLabel: string): Promise<ServiceActionResult> {
  const user = await requirePortal("app");
  const result = await changeSlot({ id: user.id, flatId: user.flatId, communityId: user.flat.community.id }, roundId, slotId, new Date());
  if (!result.ok) return { ok: false, message: t(`serviceDay.errors.${result.error}`) };
  refresh();
  return { ok: true, message: t("serviceDay.slotChanged", { slot: slotLabel }) };
}

/** "Keep this slot every week" and "pay from my wallet automatically". */
export async function setWeeklyAction(roundId: string, keepSlotWeekly: boolean, autoPayFromWallet: boolean): Promise<ServiceActionResult> {
  const user = await requirePortal("app");
  const saved = await setBookingPreferences({ id: user.id, flatId: user.flatId, communityId: user.flat.community.id }, roundId, { keepSlotWeekly, autoPayFromWallet });
  if (!saved) return { ok: false, message: t("serviceDay.errors.NOT_BOOKED") };
  refresh();
  return { ok: true, message: t("serviceDay.prefsSaved") };
}

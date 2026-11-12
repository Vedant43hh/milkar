import "server-only";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { autoPayHoldIn } from "./bookings";
import { notify } from "./notifications";
import { placeStandingOrder } from "./subscriptions";

// Weekly auto-pay, after the cutoff that opened the week: standing grocery orders and held
// Service Day slots, each in its own short transaction. The cutoff calls it for the round it just
// opened; the scheduled job calls it for every round, to pick up anything a crash left behind.

/** Pays (or asks to confirm) everything still to do for `roundId`, or for every open round. */
export async function placeWeeklyOrders(now: Date, roundId?: string): Promise<{ paid: number; toConfirm: number }> {
  const scope = roundId ? { roundId } : {};
  let paid = 0;
  let toConfirm = 0;

  const standing = await prisma.standingOrder.findMany({ where: { ...scope, status: "ACTIVE", round: { status: "OPEN" } }, select: { id: true, roundId: true, placedRoundId: true } });
  for (const s of standing.filter((x) => x.placedRoundId !== x.roundId)) {
    const result = await placeStandingOrder(s.id, now);
    if (result === "PAID") paid++;
    if (result === "TO_CONFIRM") toConfirm++;
  }

  const holds = await prisma.serviceBooking.findMany({ where: { ...scope, status: "HELD", autoPayFromWallet: true, autoPayCheckedAt: null, holdExpiresAt: { gt: now } }, select: { id: true } });
  for (const h of holds) {
    const result = await autoPayHeld(h.id, now);
    if (result === "PAID") paid++;
    if (result === "TO_CONFIRM") toConfirm++;
  }
  return { paid, toConfirm };
}

/** One held slot with auto-pay: booked from the wallet if it covers it, otherwise held for the resident. Once. */
async function autoPayHeld(bookingId: string, now: Date): Promise<"PAID" | "TO_CONFIRM" | "SKIPPED"> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ServiceBooking" WHERE id = ${bookingId} AND "autoPayCheckedAt" IS NULL FOR UPDATE`;
    if (rows.length === 0) return "SKIPPED";
    const hold = await tx.serviceBooking.findUniqueOrThrow({
      where: { id: bookingId },
      select: { userId: true, roundId: true, holdExpiresAt: true, slot: { select: { startsAt: true } }, round: { select: { title: true, service: { select: { name: true } } } } },
    });
    await tx.serviceBooking.update({ where: { id: bookingId }, data: { autoPayCheckedAt: now } });
    const service = hold.round.service?.name ?? hold.round.title;
    const href = `/round/${hold.roundId}`;
    const startsAt = hold.slot?.startsAt.toISOString() ?? now.toISOString();
    const result = await autoPayHoldIn(tx, bookingId, now);
    if (result.status === "PAID") {
      await notify(tx, [hold.userId], { type: "SLOT_AUTO_BOOKED", params: { service, startsAt, amountPaise: result.paidPaise }, href }, { dedupeKey: notificationKeys.slotAutoBooked(bookingId), now });
      return "PAID";
    }
    await notify(
      tx,
      [hold.userId],
      { type: "SLOT_HELD", params: { service, startsAt, expiresAt: (hold.holdExpiresAt ?? now).toISOString() }, href },
      { dedupeKey: notificationKeys.slotHeld(bookingId), now },
    );
    return "TO_CONFIRM";
  });
}

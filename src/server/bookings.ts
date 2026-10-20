import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isTakingOrders } from "@/lib/rounds";
import { checkoutFromWallet, type Shopper } from "./checkout";
import { lockRound } from "./round-lock";
import { moveSeat } from "./slots";

export type SlotChangeResult = { ok: true } | { ok: false; error: "NOT_BOOKED" | "ROUND_CLOSED" | "SLOT_FULL" | "SLOT_REQUIRED" };

/**
 * Moves the flat's booking to another slot of the same Service Day, free of charge, until the
 * cutoff. Runs under the round lock with the conditional seat increment, so two flats racing for
 * the last seat can't both get it.
 */
export async function changeSlot(shopper: Shopper, roundId: string, slotId: string, now: Date): Promise<SlotChangeResult> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockRound(tx, roundId))) return { ok: false, error: "ROUND_CLOSED" };
    const round = await tx.orderRound.findUniqueOrThrow({ where: { id: roundId }, include: { slots: { select: { id: true } } } });
    if (round.communityId !== shopper.communityId || !isTakingOrders(round, now)) return { ok: false, error: "ROUND_CLOSED" };
    if (!round.slots.some((s) => s.id === slotId)) return { ok: false, error: "SLOT_REQUIRED" };
    const booking = await tx.serviceBooking.findUnique({ where: { roundId_flatId: { roundId, flatId: shopper.flatId } } });
    if (!booking || booking.status !== "ACTIVE") return { ok: false, error: "NOT_BOOKED" };
    return (await moveSeat(tx, booking.id, slotId)) ? { ok: true } : { ok: false, error: "SLOT_FULL" };
  });
}

/** "Keep this slot every week" and "pay from my wallet automatically", for repeating Service Days. */
export async function setBookingPreferences(shopper: Shopper, roundId: string, prefs: { keepSlotWeekly: boolean; autoPayFromWallet: boolean }): Promise<boolean> {
  const { count } = await prisma.serviceBooking.updateMany({
    where: { roundId, flatId: shopper.flatId, status: { in: ["ACTIVE", "HELD"] }, round: { communityId: shopper.communityId } },
    // Auto-pay only makes sense for a slot that is kept.
    data: { keepSlotWeekly: prefs.keepSlotWeekly, autoPayFromWallet: prefs.keepSlotWeekly && prefs.autoPayFromWallet },
  });
  return count === 1;
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Last week's units for this resident, mapped onto the same options in the new round. */
export async function lastWeekTargets(db: Db, bookingId: string, userId: string): Promise<Record<string, number>> {
  const booking = await db.serviceBooking.findUnique({
    where: { id: bookingId },
    select: { roundId: true, flatId: true, repeatOf: { select: { roundId: true } } },
  });
  if (!booking?.repeatOf) return {};
  // One query at a time: inside a transaction they share a single connection.
  const previous = await db.orderItem.findMany({
    where: { roundId: booking.repeatOf.roundId, flatId: booking.flatId, userId, quantity: { gt: 0 } },
    select: { quantity: true, offering: { select: { serviceOptionId: true } } },
  });
  const current = await db.roundOffering.findMany({ where: { roundId: booking.roundId }, select: { id: true, serviceOptionId: true } });
  const byOption = new Map(current.map((o) => [o.serviceOptionId, o.id]));
  return Object.fromEntries(previous.flatMap((i) => (byOption.has(i.offering.serviceOptionId) ? [[byOption.get(i.offering.serviceOptionId)!, i.quantity]] : [])));
}

export type AutoPayResult = "PAID" | "NOT_ENOUGH" | "SKIPPED";

/**
 * For a slot held from last week with auto-pay on: books the same units again if the wallet
 * covers them, without touching any card or UPI. Otherwise the hold stays for the resident to
 * confirm and pay. Runs inside the caller's transaction (the cutoff job opening next week's round).
 */
export async function autoPayHoldIn(tx: Prisma.TransactionClient, bookingId: string, now: Date): Promise<{ status: AutoPayResult; paidPaise: number }> {
  const skipped = { status: "SKIPPED" as const, paidPaise: 0 };
  const booking = await tx.serviceBooking.findUnique({
    where: { id: bookingId },
    select: { status: true, autoPayFromWallet: true, holdExpiresAt: true, roundId: true, flatId: true, userId: true, round: { select: { communityId: true } } },
  });
  if (!booking || booking.status !== "HELD" || !booking.autoPayFromWallet) return skipped;
  if (!booking.holdExpiresAt || booking.holdExpiresAt.getTime() <= now.getTime()) return skipped;
  const targets = await lastWeekTargets(tx, bookingId, booking.userId);
  if (Object.keys(targets).length === 0) return skipped;

  const shopper = { id: booking.userId, flatId: booking.flatId, communityId: booking.round.communityId };
  const result = await checkoutFromWallet(tx, shopper, booking.roundId, targets, now, { keepSlotWeekly: true, autoPayFromWallet: true });
  if (result.status === "PAID") {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: result.paymentId }, select: { walletAppliedPaise: true } });
    return { status: "PAID", paidPaise: payment.walletAppliedPaise };
  }
  const short = result.status === "REJECTED" && result.errors.some((e) => e.code === "PRICE_CHANGED");
  return short ? { status: "NOT_ENOUGH", paidPaise: 0 } : skipped;
}

/** The same in a transaction of its own. */
export async function autoPayHold(bookingId: string, now: Date): Promise<AutoPayResult> {
  return (await prisma.$transaction((tx) => autoPayHoldIn(tx, bookingId, now))).status;
}

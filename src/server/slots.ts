import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Takes one seat in a slot if one is free. A single conditional UPDATE (bookedCount < capacity),
 * so concurrent bookings queue on the row and the losers see the slot full: it can never be
 * overbooked. A check constraint on the table backs this up.
 */
export async function takeSeat(db: Db, slotId: string): Promise<boolean> {
  const { count } = await db.serviceSlot.updateMany({
    where: { id: slotId, bookedCount: { lt: prisma.serviceSlot.fields.capacity } },
    data: { bookedCount: { increment: 1 } },
  });
  return count === 1;
}

export async function releaseSeat(db: Db, slotId: string): Promise<void> {
  await db.serviceSlot.updateMany({ where: { id: slotId, bookedCount: { gt: 0 } }, data: { bookedCount: { decrement: 1 } } });
}

/** Moves a booking's seat to another slot. Call inside a transaction; returns false if the new slot is full. */
export async function moveSeat(tx: Prisma.TransactionClient, bookingId: string, toSlotId: string): Promise<boolean> {
  const booking = await tx.serviceBooking.findUniqueOrThrow({ where: { id: bookingId }, select: { slotId: true } });
  if (booking.slotId === toSlotId) return true;
  if (!(await takeSeat(tx, toSlotId))) return false;
  await releaseSeat(tx, booking.slotId);
  await tx.serviceBooking.update({ where: { id: bookingId }, data: { slotId: toSlotId } });
  return true;
}

/**
 * Cancels weekly holds nobody confirmed in time and frees their seats. Each hold is cancelled with
 * a conditional update, so overlapping cron runs release a seat exactly once.
 */
export async function expireHolds(now: Date): Promise<number> {
  const due = await prisma.serviceBooking.findMany({
    where: { status: "HELD", holdExpiresAt: { lte: now } },
    select: { id: true, slotId: true },
  });
  let expired = 0;
  for (const hold of due) {
    const released = await prisma.$transaction(async (tx) => {
      const { count } = await tx.serviceBooking.updateMany({ where: { id: hold.id, status: "HELD" }, data: { status: "CANCELLED" } });
      if (count === 1) await releaseSeat(tx, hold.slotId);
      return count === 1;
    });
    if (released) expired++;
  }
  return expired;
}

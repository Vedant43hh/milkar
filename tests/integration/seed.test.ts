// The demo seed goes through the real pricing engine; these checks keep its story consistent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { groupBasis } from "@/lib/pricing/basis";
import { computeMeter } from "@/lib/pricing/meter";
import type { Tier } from "@/lib/pricing/tiers";
import { buildWorld, writeWorld } from "../../prisma/seed-scenario";
import { truncateAll } from "../../prisma/truncate";

const now = new Date("2026-10-19T12:00:00Z");

beforeAll(async () => {
  await truncateAll(prisma);
  await writeWorld(prisma, buildWorld(now).world);
});

afterAll(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

describe("seeded demo data", () => {
  it("never overbooks a slot, and slot counts match their bookings", async () => {
    const rows = await prisma.$queryRaw<{ capacity: number; booked: number; actual: bigint }[]>`
      SELECT s.capacity, s."bookedCount" AS booked,
        (SELECT count(*) FROM "ServiceBooking" b WHERE b."slotId" = s.id AND b.status <> 'CANCELLED') AS actual
      FROM "ServiceSlot" s`;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.booked).toBeLessThanOrEqual(r.capacity);
      expect(Number(r.actual)).toBe(r.booked);
    }
  });

  it("charges every order item exactly the sum of its lots", async () => {
    const [{ bad }] = await prisma.$queryRaw<{ bad: bigint }[]>`
      SELECT count(*) AS bad FROM "OrderItem" oi
      WHERE oi."chargedPaise" <> coalesce((SELECT sum(l.quantity * l."unitPricePaise") FROM "OrderLot" l WHERE l."orderItemId" = oi.id), 0)`;
    expect(Number(bad)).toBe(0);
  });

  it("never takes a wallet below zero at any point in its history", async () => {
    const [{ lowest }] = await prisma.$queryRaw<{ lowest: bigint | null }[]>`
      SELECT min(balance) AS lowest FROM (
        SELECT sum("amountPaise") OVER (PARTITION BY "userId" ORDER BY "createdAt", id) AS balance FROM "WalletTransaction"
      ) AS running`;
    expect(Number(lowest)).toBeGreaterThanOrEqual(0);
  });

  it("has the open AC Service Day at 14 flats, 6 more to unlock ₹400", async () => {
    const round = await prisma.orderRound.findFirstOrThrow({
      where: { title: "AC servicing Service Day", status: "OPEN" },
      include: { offerings: { include: { orderItems: true, serviceOption: true } }, slots: true },
    });
    const items = round.offerings.flatMap((o) => o.orderItems);
    const flats = groupBasis(items, "FLATS");
    expect(flats).toBe(14);
    const split = round.offerings.find((o) => o.serviceOption?.name === "Split AC")!;
    const meter = computeMeter(
      { tierBasis: "FLATS", tiers: split.tiers as Tier[], marginBps: round.marginBps, gstBps: split.gstBps, minOrderQty: split.minOrderQty, mrpPaise: split.mrpPaise },
      flats,
    );
    expect(meter).toMatchObject({ count: 14, currentUnitPaise: 54900, next: { needed: 6, unitPaise: 40000 } });
    expect(round.slots.filter((s) => s.bookedCount === s.capacity).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps last week's car-wash slots: one paid from the wallet, two held for 24 hours", async () => {
    const thisWeek = await prisma.orderRound.findFirstOrThrow({ where: { title: "Weekly car wash", status: "OPEN" }, include: { bookings: true } });
    const kept = thisWeek.bookings.filter((b) => b.repeatOfBookingId);
    expect(kept.map((b) => b.status).sort()).toEqual(["ACTIVE", "HELD", "HELD"]);
    const opened = thisWeek.createdAt.getTime();
    for (const hold of kept.filter((b) => b.status === "HELD")) expect(hold.holdExpiresAt?.getTime()).toBe(opened + 24 * 3_600_000);
  });

  it("resolves the deep-clean complaint with exactly one revisit, and refunds the no-access visit minus the fee", async () => {
    const issue = await prisma.serviceIssue.findFirstOrThrow({ include: { visit: { include: { revisit: true } } } });
    expect(issue).toMatchObject({ kind: "NOT_DONE_PROPERLY", status: "RESOLVED" });
    expect(issue.visit.revisit).toMatchObject({ kind: "REVISIT", status: "COMPLETED" });

    const noAccess = await prisma.serviceVisit.findFirstOrThrow({ where: { status: "NO_ACCESS" }, include: { round: true } });
    const items = await prisma.orderItem.findMany({ where: { roundId: noAccess.roundId, flatId: noAccess.flatId } });
    const paid = items.reduce((s, i) => s + (i.finalPaise ?? 0), 0);
    const refunds = await prisma.walletTransaction.aggregate({ where: { type: "NO_ACCESS_REFUND", orderItemId: { in: items.map((i) => i.id) } }, _sum: { amountPaise: true } });
    expect(refunds._sum.amountPaise).toBe(paid - (noAccess.round.noAccessFeePaise ?? 0));
    expect(await prisma.vendorAdjustment.count({ where: { visitId: noAccess.id, type: "NO_ACCESS_FEE" } })).toBe(1);
  });

  it("prompts the captain once for the poll that crossed its threshold", async () => {
    const poll = await prisma.interestPoll.findFirstOrThrow({ where: { title: { startsWith: "Pest control" } }, include: { _count: { select: { votes: true } } } });
    expect(poll._count.votes).toBe(23);
    expect(poll.thresholdNotifiedAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { type: "POLL_THRESHOLD", dedupeKey: `POLL_THRESHOLD:${poll.id}` } })).toBe(1);
  });

  it("keeps vendor rating totals in step with the ratings", async () => {
    const vendors = await prisma.vendor.findMany({ include: { ratings: true } });
    for (const v of vendors) {
      expect(v.ratingCount).toBe(v.ratings.length);
      expect(v.ratingSum).toBe(v.ratings.reduce((s, r) => s + r.rating, 0));
    }
    expect(vendors.find((v) => v.name.startsWith("SparkleHome"))?.ratingCount).toBeGreaterThan(0);
  });

  it("gives the demo resident unread notifications to look at", async () => {
    const rahul = await prisma.user.findUniqueOrThrow({ where: { phone: "+919000000003" } });
    expect(await prisma.notification.count({ where: { userId: rahul.id, readAt: null } })).toBeGreaterThan(0);
  });
});

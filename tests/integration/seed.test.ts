// The demo seed goes through the real pricing engine; these checks keep its story consistent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { groupBasis } from "@/lib/pricing/basis";
import { computeMeter } from "@/lib/pricing/meter";
import type { Tier } from "@/lib/pricing/tiers";
import { getInvoice, getRoundHistory, getWalletLedger, listOrderHistory } from "@/server/history";
import { getCommunityImpact } from "@/server/impact";
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
    const issue = await prisma.serviceIssue.findFirstOrThrow({ where: { kind: "NOT_DONE_PROPERLY", round: { title: "Pre-Diwali deep cleaning" } }, include: { visit: { include: { revisit: true } } } });
    expect(issue).toMatchObject({ kind: "NOT_DONE_PROPERLY", status: "RESOLVED" });
    expect(issue.visit.revisit).toMatchObject({ kind: "REVISIT", status: "COMPLETED" });

    const noAccess = await prisma.serviceVisit.findFirstOrThrow({ where: { status: "NO_ACCESS", round: { title: "Pre-Diwali deep cleaning" } }, include: { round: true } });
    const items = await prisma.orderItem.findMany({ where: { roundId: noAccess.roundId, flatId: noAccess.flatId } });
    const paid = items.reduce((s, i) => s + (i.finalPaise ?? 0), 0);
    const refunds = await prisma.walletTransaction.aggregate({ where: { type: "NO_ACCESS_REFUND", orderItemId: { in: items.map((i) => i.id) } }, _sum: { amountPaise: true } });
    expect(refunds._sum.amountPaise).toBe(paid - (noAccess.round.noAccessFeePaise ?? 0));
    expect(await prisma.vendorAdjustment.count({ where: { visitId: noAccess.id, type: "NO_ACCESS_FEE" } })).toBe(1);
  });

  it("prompts the manager once for the poll that crossed its threshold", async () => {
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

  it("leaves Sunita a day to run: bags to hand out today and two complaints to sort out", async () => {
    const weekend = await prisma.orderRound.findFirstOrThrow({ where: { title: "Weekend staples" }, include: { distributionRecords: true } });
    expect(weekend.status).toBe("FINALIZED");
    expect(weekend.distributionRecords.length).toBeGreaterThan(5);
    expect(weekend.distributionRecords.every((d) => d.status === "PENDING")).toBe(true);
    const kavya = await prisma.user.findUniqueOrThrow({ where: { phone: "+919000000005" } });
    expect(weekend.distributionRecords.some((d) => d.flatId === kavya.flatId)).toBe(true);
    const open = await prisma.serviceIssue.findMany({ where: { status: "OPEN" }, select: { kind: true } });
    expect(open.map((i) => i.kind).sort()).toEqual(["NOT_DONE_PROPERLY", "NO_ACCESS_DISPUTE"]);
  });

  it("leaves Rahul's and Kavya's chimney visits from yesterday to rate, and open for a complaint", async () => {
    const round = await prisma.orderRound.findFirstOrThrow({ where: { title: "Kitchen chimney cleaning" }, include: { visits: { include: { rating: true } } } });
    expect(round.status).toBe("COMPLETED");
    for (const phone of ["+919000000003", "+919000000005"]) {
      const user = await prisma.user.findUniqueOrThrow({ where: { phone }, include: { flat: true } });
      const history = await getRoundHistory({ id: user.id, flatId: user.flatId!, communityId: user.flat!.communityId }, round.id, now);
      expect(history?.visits).toHaveLength(1);
      expect(history?.visits[0]).toMatchObject({ status: "COMPLETED", canRate: true, report: { kind: "NOT_DONE_PROPERLY" } });
    }
    expect(round.visits.filter((v) => v.rating).length).toBe(round.visits.length - 2);
  });

  it("has FixRight's Repair Days: parts approved and paid on the Electrician Day, today's carpentry for the demo technician", async () => {
    const electrician = await prisma.orderRound.findFirstOrThrow({ where: { title: "Electrician Day" }, include: { partsRequests: { include: { payments: true } } } });
    expect(electrician.status).toBe("COMPLETED");
    const [parts] = electrician.partsRequests;
    expect(parts).toMatchObject({ status: "APPROVED", totalPaise: 52000 + 5 * 4500, pendingVisitId: null });
    expect(parts.payments).toMatchObject([{ purpose: "PARTS", status: "PAID", chargePaise: parts.totalPaise }]);
    expect(await prisma.vendorAdjustment.findFirstOrThrow({ where: { visitId: parts.visitId, type: "PARTS" } })).toMatchObject({ amountPaise: parts.totalPaise });

    const mahesh = await prisma.user.findUniqueOrThrow({ where: { phone: "+919000000023" } });
    const today = await prisma.serviceVisit.findMany({ where: { technicianId: mahesh.id, round: { title: "Carpenter Day" } }, include: { booking: true } });
    expect(today.map((v) => v.status)).toEqual(["SCHEDULED", "SCHEDULED", "SCHEDULED"]);
    expect(today.every((v) => v.booking.problemNote)).toBe(true);

    const plumber = await prisma.orderRound.findFirstOrThrow({ where: { title: "Plumber Day", status: "OPEN" }, include: { orderItems: true } });
    expect(groupBasis(plumber.orderItems, "FLATS")).toBe(7);
  });
});

// The resident's orders, invoices and wallet are read from different tables: payments, order items
// and the wallet ledger. Across every seeded resident and round, they must tell the same story.
describe("order history, invoices and the wallet", () => {
  const POST_CUTOFF = ["SHORT_DELIVERY_REFUND", "NO_ACCESS_REFUND", "VISIT_CANCEL_REFUND", "SERVICE_ISSUE_REFUND", "ROUND_CANCEL_REFUND", "ADJUSTMENT"] as const;

  async function residents() {
    const users = await prisma.user.findMany({ where: { role: "RESIDENT", flatId: { not: null } }, include: { flat: true } });
    return users.map((u) => ({ id: u.id, name: u.name, flatId: u.flatId!, communityId: u.flat!.communityId }));
  }

  it("shows what each resident paid and got back, exactly as payments and the ledger record it", async () => {
    let rounds = 0;
    for (const user of await residents()) {
      for (const entry of await listOrderHistory(user)) {
        const paid = await prisma.payment.aggregate({ where: { userId: user.id, roundId: entry.id, status: "PAID" }, _sum: { chargePaise: true } });
        const late = await prisma.payment.aggregate({ where: { userId: user.id, roundId: entry.id, status: "CREDITED_TO_WALLET" }, _sum: { gatewayPaise: true } });
        const back = await prisma.walletTransaction.aggregate({ where: { userId: user.id, roundId: entry.id, amountPaise: { gt: 0 } }, _sum: { amountPaise: true } });
        expect(entry.money.paidPaise).toBe((paid._sum.chargePaise ?? 0) + (late._sum.gatewayPaise ?? 0));
        expect(entry.money.refundedPaise).toBe(back._sum.amountPaise ?? 0);
        rounds++;
      }
    }
    expect(rounds).toBeGreaterThan(50);
  });

  it("invoices the final prices, which add up to what was paid less every refund", async () => {
    let invoices = 0;
    for (const user of await residents()) {
      for (const entry of await listOrderHistory(user)) {
        const result = await getInvoice(user, entry.id);
        if (!result) continue;
        const items = await prisma.orderItem.findMany({ where: { userId: user.id, roundId: entry.id } });
        const confirmedFinal = items.filter((i) => i.status === "CONFIRMED").reduce((s, i) => s + (i.finalPaise ?? 0), 0);
        const absorbed = items.reduce((s, i) => s + (i.absorbedPaise ?? 0), 0);
        const afterCutoff = await prisma.walletTransaction.aggregate({ where: { userId: user.id, roundId: entry.id, type: { in: [...POST_CUTOFF] } }, _sum: { amountPaise: true } });
        const { invoice, money } = result;
        // Repair visits: parts the resident paid for and kept are on the invoice too.
        const parts = await prisma.partsRequest.aggregate({
          where: { roundId: entry.id, status: "APPROVED", payments: { some: { userId: user.id, status: "PAID" } } },
          _sum: { totalPaise: true },
        });
        expect(invoice.totals.totalPaise).toBe(confirmedFinal + (parts._sum.totalPaise ?? 0));
        expect(invoice.totals.taxablePaise + invoice.totals.gstPaise).toBe(invoice.totals.totalPaise);
        // paid − refunds at reduction and cutoff = final − what Milkar absorbed; later refunds come off that.
        expect(money.netPaise).toBe(invoice.totals.totalPaise - absorbed - (afterCutoff._sum.amountPaise ?? 0));
        invoices++;
      }
    }
    expect(invoices).toBeGreaterThan(30);
  });

  it("has no invoice for a round that is still taking orders", async () => {
    const open = await prisma.orderRound.findFirstOrThrow({ where: { status: "OPEN", kind: "GROCERY", community: { code: "GREENMDW" } }, include: { orderItems: { take: 1, include: { user: { include: { flat: true } } } } } });
    const buyer = open.orderItems[0].user;
    expect(await getInvoice({ id: buyer.id, name: buyer.name, flatId: buyer.flatId!, communityId: buyer.flat!.communityId }, open.id)).toBeNull();
  });

  it("lists the whole wallet ledger, adding up to the balance", async () => {
    for (const user of await residents()) {
      const { balancePaise, entries, hasMore } = await getWalletLedger(user.id, 500);
      expect(hasMore).toBe(false);
      expect(entries.reduce((s, e) => s + e.amountPaise, 0)).toBe(balancePaise);
    }
  });

  it("counts the community's savings and the vendor trips it avoided", async () => {
    const gm = await prisma.community.findUniqueOrThrow({ where: { code: "GREENMDW" } });
    const impact = await getCommunityImpact(gm.id);
    expect(impact.savedPaise).toBeGreaterThan(0);
    expect(impact.trips.separate).toBeGreaterThan(impact.trips.together);
    expect(impact.trips.avoided).toBe(impact.trips.separate - impact.trips.together);
    expect(impact.km).toBe(impact.trips.avoided * impact.assumptions.kmPerTrip);
  });
});

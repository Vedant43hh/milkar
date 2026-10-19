// Phase 4: the database guards Service Days rely on: slot capacity under concurrency, holds,
// and the one-per-flat / one-revisit / rating constraints.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { expireHolds, moveSeat, takeSeat } from "@/server/slots";
import { truncateAll } from "../../prisma/truncate";
import { makeServiceDay, nextPhone } from "./helpers";

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const now = new Date("2026-10-20T06:00:00Z");

describe("slot capacity", () => {
  it("lets exactly one of ten simultaneous bookings take the last seat", async () => {
    const day = await makeServiceDay({ capacities: [1] });
    const results = await Promise.all(Array.from({ length: 10 }, () => takeSeat(prisma, day.slots[0].id)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: day.slots[0].id } })).bookedCount).toBe(1);
  });

  it("fills a 3-seat slot with exactly 3 of 10 racing bookings, each in its own transaction", async () => {
    const day = await makeServiceDay({ capacities: [3] });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => prisma.$transaction(async (tx) => takeSeat(tx, day.slots[0].id))),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: day.slots[0].id } })).bookedCount).toBe(3);
  });

  it("is backed by a check constraint, so even a raw update cannot overbook", async () => {
    const day = await makeServiceDay({ capacities: [2] });
    await expect(prisma.serviceSlot.update({ where: { id: day.slots[0].id }, data: { bookedCount: 3 } })).rejects.toThrow();
    await expect(prisma.serviceSlot.update({ where: { id: day.slots[0].id }, data: { bookedCount: -1 } })).rejects.toThrow();
  });

  it("lets only one of two flats move into the last seat of another slot", async () => {
    const day = await makeServiceDay({ capacities: [2, 1] });
    const [full, target] = day.slots;
    const bookings = [];
    for (const flat of day.flats.slice(0, 2)) {
      expect(await takeSeat(prisma, full.id)).toBe(true);
      bookings.push(await prisma.serviceBooking.create({ data: { roundId: day.round.id, flatId: flat.id, slotId: full.id, userId: day.userId, status: "ACTIVE" } }));
    }
    const moved = await Promise.all(bookings.map((b) => prisma.$transaction((tx) => moveSeat(tx, b.id, target.id))));
    expect(moved.filter(Boolean)).toHaveLength(1);
    const slots = await prisma.serviceSlot.findMany({ where: { roundId: day.round.id }, orderBy: { startsAt: "asc" } });
    expect(slots.map((s) => s.bookedCount)).toEqual([1, 1]);
    const inTarget = await prisma.serviceBooking.count({ where: { slotId: target.id } });
    expect(inTarget).toBe(1);
  });
});

describe("weekly holds", () => {
  it("expire after 24 hours, free their seat, and expire only once", async () => {
    const day = await makeServiceDay({ capacities: [2] });
    const slotId = day.slots[0].id;
    const hold = (flatId: string, holdExpiresAt: Date) =>
      prisma.serviceBooking.create({ data: { roundId: day.round.id, flatId, slotId, userId: day.userId, status: "HELD", holdExpiresAt } });
    await takeSeat(prisma, slotId);
    await takeSeat(prisma, slotId);
    const overdue = await hold(day.flats[0].id, new Date(now.getTime() - 1));
    const current = await hold(day.flats[1].id, new Date(now.getTime() + 60_000));

    expect(await expireHolds(now)).toBe(1);
    expect(await expireHolds(now)).toBe(0);
    expect((await prisma.serviceBooking.findUniqueOrThrow({ where: { id: overdue.id } })).status).toBe("CANCELLED");
    expect((await prisma.serviceBooking.findUniqueOrThrow({ where: { id: current.id } })).status).toBe("HELD");
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: slotId } })).bookedCount).toBe(1);
  });

  it("release a seat once even when two cron runs overlap", async () => {
    const day = await makeServiceDay({ capacities: [1] });
    const slotId = day.slots[0].id;
    await takeSeat(prisma, slotId);
    await prisma.serviceBooking.create({
      data: { roundId: day.round.id, flatId: day.flats[0].id, slotId, userId: day.userId, status: "HELD", holdExpiresAt: new Date(now.getTime() - 1) },
    });
    const [a, b] = await Promise.all([expireHolds(now), expireHolds(now)]);
    expect(a + b).toBe(1);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: slotId } })).bookedCount).toBe(0);
  });
});

describe("one per flat, one revisit, valid ratings", () => {
  it("allows one booking per flat per round, shared by family members", async () => {
    const day = await makeServiceDay({ capacities: [3] });
    const data = { roundId: day.round.id, flatId: day.flats[0].id, slotId: day.slots[0].id, userId: day.userId, status: "ACTIVE" as const };
    await prisma.serviceBooking.create({ data });
    const spouse = await prisma.user.create({ data: { phone: nextPhone(), flatId: day.flats[0].id } });
    await expect(prisma.serviceBooking.create({ data: { ...data, userId: spouse.id } })).rejects.toThrow();
  });

  it("allows one free revisit per visit, and ratings from 1 to 5 only", async () => {
    const day = await makeServiceDay({ capacities: [1] });
    const booking = await prisma.serviceBooking.create({
      data: { roundId: day.round.id, flatId: day.flats[0].id, slotId: day.slots[0].id, userId: day.userId, status: "ACTIVE" },
    });
    const visit = { roundId: day.round.id, bookingId: booking.id, flatId: day.flats[0].id, startsAt: now, endsAt: new Date(now.getTime() + 3_600_000), completionCode: "4821" };
    const original = await prisma.serviceVisit.create({ data: { ...visit, slotId: day.slots[0].id, status: "COMPLETED", completedAt: now } });
    await prisma.serviceVisit.create({ data: { ...visit, kind: "REVISIT", revisitOfId: original.id } });
    await expect(prisma.serviceVisit.create({ data: { ...visit, kind: "REVISIT", revisitOfId: original.id } })).rejects.toThrow();

    const rating = { visitId: original.id, userId: day.userId, vendorId: day.vendorId };
    await expect(prisma.visitRating.create({ data: { ...rating, rating: 6 } })).rejects.toThrow();
    await expect(prisma.visitRating.create({ data: { ...rating, rating: 0 } })).rejects.toThrow();
    await prisma.visitRating.create({ data: { ...rating, rating: 5 } });
    await expect(prisma.visitRating.create({ data: { ...rating, rating: 4 } })).rejects.toThrow(); // one rating per visit
  });

  it("counts poll votes once per flat", async () => {
    const day = await makeServiceDay({ capacities: [1] });
    const poll = await prisma.interestPoll.create({
      data: { communityId: day.communityId, kind: "SERVICE", title: "Pest control", threshold: 2, status: "OPEN" },
    });
    const spouse = await prisma.user.create({ data: { phone: nextPhone(), flatId: day.flats[0].id } });
    await prisma.pollVote.create({ data: { pollId: poll.id, flatId: day.flats[0].id, userId: day.userId } });
    await expect(prisma.pollVote.create({ data: { pollId: poll.id, flatId: day.flats[0].id, userId: spouse.id } })).rejects.toThrow();
  });
});

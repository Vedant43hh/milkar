// Phase 5: managers open, run and cancel rounds, and turn polls into rounds.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { castVote, convertPollToRound, createPoll, publishSuggestion, suggestPoll, MAX_OPEN_SUGGESTIONS } from "@/server/polls";
import { cancelRound, closeRoundNow, createGroceryRound, createServiceRound, extendCutoff } from "@/server/rounds";
import { truncateAll } from "../../prisma/truncate";
import { makeCatalogue, makeNeighbourhood } from "./helpers";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const now = new Date("2026-10-20T06:00:00Z"); // Tue 11:30 AM IST
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
const istDay = (offset: number) => new Date(Date.UTC(2026, 9, 20 + offset) - 330 * 60_000);

async function groceryRound(actor: Awaited<ReturnType<typeof makeNeighbourhood>>["actor"], productId: string, cap = 4) {
  const result = await createGroceryRound(actor, { title: "Weekly staples", cutoffAt: hours(48), deliveryAt: hours(72), requirePickupCode: true, products: [{ productId, maxQtyPerFlat: cap }] }, now);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.roundId;
}

describe("opening rounds", () => {
  it("snapshots prices and settings into a grocery round and tells only that community", async () => {
    const home = await makeNeighbourhood("HOME1", 3);
    const other = await makeNeighbourhood("ELSE1", 2);
    const { rice } = await makeCatalogue();
    await prisma.platformSetting.create({ data: { id: 1, marginBps: 250, reductionFreezeMinutes: 600 } });

    const roundId = await groceryRound(home.actor, rice.id, 6);
    const round = await prisma.orderRound.findUniqueOrThrow({ where: { id: roundId }, include: { offerings: true } });
    expect(round).toMatchObject({ kind: "GROCERY", status: "OPEN", marginBps: 250, reductionFreezeMinutes: 600, communityId: home.community.id });
    expect(round.offerings).toHaveLength(1);
    expect(round.offerings[0]).toMatchObject({ tierBasis: "UNITS", tierGroupKey: `product:${rice.id}`, maxQtyPerFlat: 6, minOrderQty: 10, gstBps: 500 });
    expect(round.offerings[0].tiers).toEqual([
      { minQty: 1, vendorPricePaise: 46232 },
      { minQty: 20, vendorPricePaise: 42996 },
      { minQty: 50, vendorPricePaise: 40684 },
    ]);

    // Later catalogue changes don't touch the open round.
    await prisma.priceTier.updateMany({ where: { productId: rice.id }, data: { vendorPricePaise: 1 } });
    expect((await prisma.roundOffering.findFirstOrThrow({ where: { roundId } })).tiers).toEqual(round.offerings[0].tiers);

    const told = await prisma.notification.findMany({ where: { type: "ROUND_OPENED" }, select: { userId: true } });
    const homeIds = home.residents.map((r) => r.id).sort(); // residents only: the Society Manager opened it
    expect(told.map((n) => n.userId).sort()).toEqual(homeIds);
    expect(told.some((n) => other.residents.some((r) => r.id === n.userId))).toBe(false);
  });

  it("refuses residents, and managers of another community", async () => {
    const home = await makeNeighbourhood("HOME2", 2);
    const { rice } = await makeCatalogue();
    const input = { title: "Staples", cutoffAt: hours(48), deliveryAt: hours(72), requirePickupCode: true, products: [{ productId: rice.id, maxQtyPerFlat: 4 }] };
    expect(await createGroceryRound({ id: home.residents[1].id, role: "RESIDENT", communityId: home.community.id }, input, now)).toEqual({ ok: false, errors: ["FORBIDDEN"] });
    expect(await createGroceryRound({ ...home.actor, communityId: null }, input, now)).toEqual({ ok: false, errors: ["FORBIDDEN"] });
    expect(await prisma.orderRound.count()).toBe(0);
  });

  it("explains every problem with a grocery round at once", async () => {
    const home = await makeNeighbourhood("HOME3", 2);
    const { rice } = await makeCatalogue();
    const result = await createGroceryRound(
      home.actor,
      { title: "x", cutoffAt: hours(0.5), deliveryAt: hours(0.25), requirePickupCode: true, products: [{ productId: rice.id, maxQtyPerFlat: 0 }, { productId: "nope", maxQtyPerFlat: 2 }] },
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sort()).toEqual(["CUTOFF_TOO_SOON", "DELIVERY_BEFORE_CUTOFF", "INVALID_CAP", "INVALID_TITLE", "UNKNOWN_PRODUCT"]);
  });

  it("opens a Service Day with one offering per option on the flats basis, and slots from the vendor's templates", async () => {
    const home = await makeNeighbourhood("HOME4", 2);
    const { ac } = await makeCatalogue();
    const result = await createServiceRound(home.actor, { serviceId: ac.id, title: "AC Service Day", cutoffAt: hours(48), days: [istDay(5), istDay(6)], repeatWeekly: true }, now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const round = await prisma.orderRound.findUniqueOrThrow({
      where: { id: result.roundId },
      include: { offerings: { orderBy: { mrpPaise: "desc" } }, slots: { orderBy: { startsAt: "asc" } } },
    });
    expect(round).toMatchObject({ kind: "SERVICE", serviceId: ac.id, vendorId: ac.vendorId, noAccessFeePaise: 14900, repeatWeekly: true, requirePickupCode: false });
    expect(round.offerings.map((o) => [o.tierBasis, o.tierGroupKey, o.minOrderQty, o.maxQtyPerFlat, o.unitLabel])).toEqual([
      ["FLATS", `service:${ac.id}`, 5, 4, "unit"],
      ["FLATS", `service:${ac.id}`, 5, 3, "unit"],
    ]);
    expect(round.offerings[0].tiers).toEqual([
      { minQty: 1, vendorPricePaise: 57512 },
      { minQty: 5, vendorPricePaise: 45170 },
    ]);
    // Two days × two templates; 9 AM IST = 03:30 UTC. Capacity = technicians.
    expect(round.slots.map((s) => [s.startsAt.toISOString(), s.capacity, s.bookedCount])).toEqual([
      ["2026-10-25T03:30:00.000Z", 3, 0],
      ["2026-10-25T08:30:00.000Z", 2, 0],
      ["2026-10-26T03:30:00.000Z", 3, 0],
      ["2026-10-26T08:30:00.000Z", 2, 0],
    ]);
    expect(round.deliveryAt).toEqual(round.slots[0].startsAt);
  });

  it("refuses a Service Day whose first slot starts before bookings close", async () => {
    const home = await makeNeighbourhood("HOME5", 2);
    const { ac } = await makeCatalogue();
    const result = await createServiceRound(home.actor, { serviceId: ac.id, title: "AC Service Day", cutoffAt: istDay(3), days: [istDay(2)], repeatWeekly: false }, now);
    expect(result).toEqual({ ok: false, errors: ["SERVICE_BEFORE_CUTOFF"] });
  });
});

describe("running a round", () => {
  it("extends the cutoff only later, and closes it early", async () => {
    const home = await makeNeighbourhood("RUN1", 2);
    const { rice } = await makeCatalogue();
    const roundId = await groceryRound(home.actor, rice.id);

    expect(await extendCutoff(home.actor, roundId, hours(40), now)).toEqual({ ok: false, error: "NOT_LATER" });
    expect(await extendCutoff(home.actor, roundId, hours(72), now)).toEqual({ ok: false, error: "TOO_LATE" });
    expect(await extendCutoff(home.actor, roundId, hours(60), now)).toEqual({ ok: true });
    expect(await closeRoundNow(home.actor, roundId, hours(1))).toEqual({ ok: true });
    expect(await closeRoundNow(home.actor, roundId, hours(2))).toEqual({ ok: false, error: "ROUND_CLOSED" });
    expect(await extendCutoff(home.actor, roundId, hours(65), hours(2))).toEqual({ ok: false, error: "ROUND_CLOSED" });
    const round = await prisma.orderRound.findUniqueOrThrow({ where: { id: roundId } });
    expect(round).toMatchObject({ status: "OPEN", cutoffAt: hours(1), version: 2 });
  });

  it("cancels with exact refunds, frees slots and kills unpaid quotes, once even when tapped twice at the same time", async () => {
    const home = await makeNeighbourhood("RUN2", 3);
    const { ac } = await makeCatalogue();
    const opened = await createServiceRound(home.actor, { serviceId: ac.id, title: "AC Day", cutoffAt: hours(48), days: [istDay(5)], repeatWeekly: false }, now);
    if (!opened.ok) throw new Error("not opened");
    const roundId = opened.roundId;
    const [split] = await prisma.roundOffering.findMany({ where: { roundId }, orderBy: { mrpPaise: "desc" } });
    const [slot] = await prisma.serviceSlot.findMany({ where: { roundId }, orderBy: { startsAt: "asc" } });

    // Two flats paid (one at ₹699 for 2 units, one at ₹549); one quote is still unpaid.
    const paid = [
      { user: home.residents[1], lots: [[2, 69900]] },
      { user: home.residents[2], lots: [[1, 54900]] },
    ] as const;
    for (const { user, lots } of paid) {
      const charged = lots.reduce((s, [q, p]) => s + q * p, 0);
      await prisma.orderItem.create({
        data: {
          roundId,
          offeringId: split.id,
          userId: user.id,
          flatId: user.flatId!,
          quantity: lots.reduce((n, [q]) => n + q, 0),
          chargedPaise: charged,
          lots: { create: lots.map(([quantity, unitPricePaise]) => ({ quantity, unitPricePaise })) },
        },
      });
      await prisma.serviceBooking.create({ data: { roundId, flatId: user.flatId!, slotId: slot.id, userId: user.id, status: "ACTIVE" } });
    }
    await prisma.serviceSlot.update({ where: { id: slot.id }, data: { bookedCount: 2 } });
    const quote = await prisma.payment.create({
      data: { userId: home.manager.id, roundId, changes: {}, chargePaise: 54900, creditPaise: 0, walletAppliedPaise: 0, gatewayPaise: 54900, provider: "MOCK", expiresAt: hours(1) },
    });

    const results = await Promise.all([cancelRound(home.actor, roundId, "Vendor unavailable", now), cancelRound(home.actor, roundId, "Vendor unavailable", now)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "ROUND_CLOSED" });

    const credits = await prisma.walletTransaction.findMany({ where: { type: "ROUND_CANCEL_REFUND" }, orderBy: { amountPaise: "desc" } });
    expect(credits.map((c) => [c.userId, c.amountPaise])).toEqual([
      [home.residents[1].id, 139800],
      [home.residents[2].id, 54900],
    ]);
    expect(await prisma.orderRound.findUniqueOrThrow({ where: { id: roundId } })).toMatchObject({ status: "CANCELLED", cancelReason: "Vendor unavailable", cancelledAt: now });
    expect(await prisma.orderItem.findMany({ where: { roundId }, select: { status: true, refundPaise: true, finalPaise: true } })).toEqual(
      expect.arrayContaining([{ status: "CANCELLED", refundPaise: 139800, finalPaise: 0 }]),
    );
    expect(await prisma.serviceBooking.count({ where: { roundId, status: { not: "CANCELLED" } } })).toBe(0);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: slot.id } })).bookedCount).toBe(0);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("EXPIRED");
    expect(await prisma.notification.count({ where: { type: "REFUND_CREDITED" } })).toBe(2);
  });
});

describe("interest polls", () => {
  it("prompts the manager exactly once when 25 flats vote at the same moment for a 20-flat threshold", async () => {
    const home = await makeNeighbourhood("POLL1", 25);
    const { ac } = await makeCatalogue();
    const created = await createPoll(home.actor, { kind: "SERVICE", title: "AC before summer", serviceId: ac.id, threshold: 20 }, now);
    if (!created.ok) throw new Error("no poll");

    const votes = await Promise.all(home.residents.map((r) => castVote({ id: r.id, flatId: r.flatId!, communityId: home.community.id }, created.pollId, now)));
    expect(votes.every((v) => v.ok)).toBe(true);
    expect(await prisma.pollVote.count({ where: { pollId: created.pollId } })).toBe(25);
    expect(await prisma.notification.count({ where: { type: "POLL_THRESHOLD", userId: home.manager.id } })).toBe(1);
    expect((await prisma.interestPoll.findUniqueOrThrow({ where: { id: created.pollId } })).thresholdNotifiedAt).toEqual(now);
  });

  it("counts a flat once, however many family members vote", async () => {
    const home = await makeNeighbourhood("POLL2", 2);
    const { ac } = await makeCatalogue();
    const created = await createPoll(home.actor, { kind: "SERVICE", title: "AC please", serviceId: ac.id }, now);
    if (!created.ok) throw new Error("no poll");
    expect((await prisma.interestPoll.findUniqueOrThrow({ where: { id: created.pollId } })).threshold).toBe(5); // the service's minimum flats
    const flatId = home.community.flats[0].id;
    await castVote({ id: home.manager.id, flatId, communityId: home.community.id }, created.pollId, now);
    const second = await castVote({ id: home.residents[0].id, flatId, communityId: home.community.id }, created.pollId, now);
    expect(second).toEqual({ ok: true, votes: 1, threshold: 5 });
  });

  it("opens exactly one round when the manager double-taps Open round, and tells the voters", async () => {
    const home = await makeNeighbourhood("POLL3", 6);
    const { ac } = await makeCatalogue();
    const created = await createPoll(home.actor, { kind: "SERVICE", title: "Pest control", serviceId: ac.id, threshold: 5 }, now);
    if (!created.ok) throw new Error("no poll");
    for (const r of home.residents.slice(0, 5)) await castVote({ id: r.id, flatId: r.flatId!, communityId: home.community.id }, created.pollId, now);

    const [a, b] = await Promise.all([convertPollToRound(home.actor, created.pollId, now), convertPollToRound(home.actor, created.pollId, now)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.roundId).toBe(b.roundId);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await prisma.orderRound.count()).toBe(1);

    const round = await prisma.orderRound.findUniqueOrThrow({ where: { id: a.roundId }, include: { slots: { orderBy: { startsAt: "asc" } } } });
    expect(round).toMatchObject({ kind: "SERVICE", title: "Pest control", cutoffAt: new Date("2026-10-23T14:30:00Z") }); // +3 days, 8 PM IST
    expect(round.slots[0].startsAt).toEqual(new Date("2026-10-25T03:30:00Z")); // service day +5, first slot 9 AM IST
    expect(await prisma.interestPoll.findUniqueOrThrow({ where: { id: created.pollId } })).toMatchObject({ status: "CONVERTED", convertedRoundId: a.roundId });

    const told = await prisma.notification.findMany({ where: { type: "ROUND_OPENED" }, select: { userId: true } });
    for (const voter of home.residents.slice(0, 5)) expect(told.filter((n) => n.userId === voter.id)).toHaveLength(1);
  });

  it("queues resident suggestions for the manager, with a limit, and publishes one", async () => {
    const home = await makeNeighbourhood("POLL4", 2);
    const { ac } = await makeCatalogue();
    const resident = home.residents[1];
    const me = { id: resident.id, name: resident.name, communityId: home.community.id };
    const suggestion = await suggestPoll(me, { kind: "SERVICE", title: "AC servicing", serviceId: ac.id }, now);
    if (!suggestion.ok) throw new Error("no suggestion");
    expect(await prisma.notification.count({ where: { type: "POLL_SUGGESTION", userId: home.manager.id } })).toBe(1);

    for (let i = 1; i < MAX_OPEN_SUGGESTIONS; i++) await suggestPoll(me, { kind: "PRODUCT", title: `Idea ${i}` }, now);
    expect(await suggestPoll(me, { kind: "PRODUCT", title: "One too many" }, now)).toEqual({ ok: false, errors: ["TOO_MANY_SUGGESTIONS"] });

    expect(await publishSuggestion(home.actor, suggestion.pollId, 12, now)).toEqual({ ok: true });
    expect(await publishSuggestion(home.actor, suggestion.pollId, 12, now)).toEqual({ ok: false, error: "NOT_SUGGESTED" });
    expect(await prisma.interestPoll.findUniqueOrThrow({ where: { id: suggestion.pollId } })).toMatchObject({ status: "OPEN", threshold: 12, publishedById: home.manager.id });
  });
});

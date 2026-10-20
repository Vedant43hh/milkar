// Phase 7: booking a Service Day. Seats can never be overbooked, and money is never lost.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { autoPayHold, changeSlot } from "@/server/bookings";
import { confirmPayment, startCheckout, type Shopper } from "@/server/checkout";
import { createServiceRound } from "@/server/rounds";
import { takeSeat } from "@/server/slots";
import { walletBalance } from "@/server/wallet";
import { truncateAll } from "../../prisma/truncate";
import { makeCatalogue, makeNeighbourhood, nextPhone } from "./helpers";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const now = new Date("2026-10-20T06:00:00Z");
const minutes = (m: number) => new Date(now.getTime() + m * 60_000);
const istDay = (offset: number) => new Date(Date.UTC(2026, 9, 20 + offset) - 330 * 60_000);
const P699 = 69900;

let seq = 0;
const topUp = (userId: string, amountPaise: number) =>
  prisma.walletTransaction.create({ data: { userId, amountPaise, type: "ADJUSTMENT", idempotencyKey: `TEST:${userId}:${++seq}` } });

async function setup(flats = 6) {
  const hood = await makeNeighbourhood(`BOOK${++seq}`, flats);
  const { ac } = await makeCatalogue();
  const opened = await createServiceRound(hood.actor, { serviceId: ac.id, title: "AC Day", cutoffAt: minutes(48 * 60), days: [istDay(5)], repeatWeekly: true }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const roundId = opened.roundId;
  const offerings = await prisma.roundOffering.findMany({ where: { roundId }, orderBy: { mrpPaise: "desc" } });
  const slots = await prisma.serviceSlot.findMany({ where: { roundId }, orderBy: { startsAt: "asc" } });
  const shopper = (u: { id: string; flatId: string | null }): Shopper => ({ id: u.id, flatId: u.flatId!, communityId: hood.community.id });
  return { ...hood, ac, roundId, split: offerings[0].id, window: offerings[1].id, slots, shopper };
}

const slot = (id: string) => prisma.serviceSlot.findUniqueOrThrow({ where: { id } });

describe("booking a Service Day", () => {
  it("books a flat's first units into a slot; family members join the same visit", async () => {
    const s = await setup();
    const [me] = s.residents.slice(1);
    const spouse = await prisma.user.create({ data: { phone: nextPhone(), name: "Spouse", flatId: me.flatId } });
    await topUp(me.id, P699);
    await topUp(spouse.id, P699);

    expect(await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, now, { slotId: s.slots[0].id })).toMatchObject({ status: "PAID" });
    expect(await startCheckout(s.shopper(spouse), s.roundId, { [s.window]: 1 }, now)).toMatchObject({ status: "PAID" }); // no slot needed
    expect(await prisma.serviceBooking.count({ where: { roundId: s.roundId } })).toBe(1);
    expect(await prisma.serviceBooking.findFirstOrThrow({ where: { roundId: s.roundId } })).toMatchObject({ status: "ACTIVE", slotId: s.slots[0].id, flatId: me.flatId });
    expect((await slot(s.slots[0].id)).bookedCount).toBe(1);
  });

  it("asks for a slot with the first units, and refuses a full one", async () => {
    const s = await setup();
    const me = s.residents[1];
    await topUp(me.id, P699);
    expect(await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, now)).toMatchObject({ status: "REJECTED", errors: [{ code: "SLOT_REQUIRED" }] });
    await prisma.serviceSlot.update({ where: { id: s.slots[1].id }, data: { bookedCount: s.slots[1].capacity } });
    expect(await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, now, { slotId: s.slots[1].id })).toMatchObject({ status: "REJECTED", errors: [{ code: "SLOT_FULL" }] });
    expect(await walletBalance(prisma, me.id)).toBe(P699);
  });

  it("lets exactly one of five flats take the last seat when they book at the same moment", async () => {
    const s = await setup(6);
    await prisma.serviceSlot.update({ where: { id: s.slots[0].id }, data: { capacity: 1 } });
    const flats = s.residents.slice(1, 6);
    for (const r of flats) await topUp(r.id, P699);
    const results = await Promise.all(flats.map((r) => startCheckout(s.shopper(r), s.roundId, { [s.split]: 1 }, now, { slotId: s.slots[0].id })));
    expect(results.filter((r) => r.status === "PAID")).toHaveLength(1);
    expect(results.filter((r) => r.status === "REJECTED" && r.errors[0].code === "SLOT_FULL")).toHaveLength(4);
    expect((await slot(s.slots[0].id)).bookedCount).toBe(1);
    expect(await prisma.orderItem.count({ where: { roundId: s.roundId, quantity: { gt: 0 } } })).toBe(1);
  });

  it("credits the wallet when the slot fills while the resident is paying", async () => {
    const s = await setup();
    await prisma.serviceSlot.update({ where: { id: s.slots[0].id }, data: { capacity: 1 } });
    const [a, b] = s.residents.slice(1, 3);
    const payA = await startCheckout(s.shopper(a), s.roundId, { [s.split]: 1 }, now, { slotId: s.slots[0].id });
    const payB = await startCheckout(s.shopper(b), s.roundId, { [s.split]: 1 }, now, { slotId: s.slots[0].id });
    if (payA.status !== "AWAITING_PAYMENT" || payB.status !== "AWAITING_PAYMENT") throw new Error("expected gateway payments");

    const results = await Promise.all([confirmPayment(payA.paymentId, "a", minutes(1)), confirmPayment(payB.paymentId, "b", minutes(1))]);
    expect(results.map((r) => r.status).sort()).toEqual(["CREDITED_TO_WALLET", "PAID"]);
    expect(results.find((r) => r.status === "CREDITED_TO_WALLET")).toMatchObject({ reason: "SLOT_FULL", amountPaise: P699 });
    expect((await slot(s.slots[0].id)).bookedCount).toBe(1);
  });

  it("keeps the visit while units remain, and frees the seat when the flat cancels everything", async () => {
    const s = await setup();
    const me = s.residents[1];
    await topUp(me.id, 2 * P699);
    await startCheckout(s.shopper(me), s.roundId, { [s.split]: 2 }, now, { slotId: s.slots[0].id });

    await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, minutes(10));
    expect((await prisma.serviceBooking.findFirstOrThrow({ where: { roundId: s.roundId } })).status).toBe("ACTIVE");
    await startCheckout(s.shopper(me), s.roundId, { [s.split]: 0 }, minutes(20));
    expect((await prisma.serviceBooking.findFirstOrThrow({ where: { roundId: s.roundId } })).status).toBe("CANCELLED");
    expect((await slot(s.slots[0].id)).bookedCount).toBe(0);
    expect(await walletBalance(prisma, me.id)).toBe(2 * P699);

    // Booking again picks a slot afresh (the same booking row is reused).
    await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, minutes(30), { slotId: s.slots[1].id });
    expect(await prisma.serviceBooking.findFirstOrThrow({ where: { roundId: s.roundId } })).toMatchObject({ status: "ACTIVE", slotId: s.slots[1].id });
    expect((await slot(s.slots[1].id)).bookedCount).toBe(1);
  });

  it("changes slot for free, and only one of two flats gets the last seat in the new slot", async () => {
    const s = await setup();
    await prisma.serviceSlot.update({ where: { id: s.slots[1].id }, data: { capacity: 1 } });
    const [a, b] = s.residents.slice(1, 3);
    for (const r of [a, b]) {
      await topUp(r.id, P699);
      await startCheckout(s.shopper(r), s.roundId, { [s.split]: 1 }, now, { slotId: s.slots[0].id });
    }
    const moves = await Promise.all([a, b].map((r) => changeSlot(s.shopper(r), s.roundId, s.slots[1].id, minutes(5))));
    expect(moves.filter((m) => m.ok)).toHaveLength(1);
    expect(moves.find((m) => !m.ok)).toEqual({ ok: false, error: "SLOT_FULL" });
    expect([(await slot(s.slots[0].id)).bookedCount, (await slot(s.slots[1].id)).bookedCount]).toEqual([1, 1]);
    expect(await walletBalance(prisma, a.id)).toBe(0); // moving cost nothing
  });
});

describe("weekly holds", () => {
  async function holdFor(s: Awaited<ReturnType<typeof setup>>, resident: { id: string; flatId: string | null }, holdExpiresAt: Date, repeatOfBookingId?: string) {
    await takeSeat(prisma, s.slots[0].id);
    return prisma.serviceBooking.create({
      data: { roundId: s.roundId, flatId: resident.flatId!, slotId: s.slots[0].id, userId: resident.id, status: "HELD", holdExpiresAt, keepSlotWeekly: true, autoPayFromWallet: true, repeatOfBookingId },
    });
  }

  it("turns a held slot into the booking when the resident confirms, without taking another seat", async () => {
    const s = await setup();
    const me = s.residents[1];
    await holdFor(s, me, minutes(24 * 60));
    await topUp(me.id, P699);
    expect(await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, now)).toMatchObject({ status: "PAID" });
    expect(await prisma.serviceBooking.findFirstOrThrow({ where: { roundId: s.roundId } })).toMatchObject({ status: "ACTIVE", holdExpiresAt: null });
    expect((await slot(s.slots[0].id)).bookedCount).toBe(1);
  });

  it("gives a lapsed hold's seat back, so the resident picks a slot again", async () => {
    const s = await setup();
    const me = s.residents[1];
    await holdFor(s, me, minutes(-1));
    await topUp(me.id, P699);
    expect(await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, now)).toMatchObject({ status: "REJECTED", errors: [{ code: "SLOT_REQUIRED" }] });
    expect(await startCheckout(s.shopper(me), s.roundId, { [s.split]: 1 }, now, { slotId: s.slots[1].id })).toMatchObject({ status: "PAID" });
    expect([(await slot(s.slots[0].id)).bookedCount, (await slot(s.slots[1].id)).bookedCount]).toEqual([0, 1]);
  });

  it("auto-pays last week's units from the wallet, or leaves the hold for the resident", async () => {
    const lastWeek = await setup();
    const [rich, short] = lastWeek.residents.slice(1, 3);
    const lastBookings = [];
    for (const r of [rich, short]) {
      await topUp(r.id, 2 * P699);
      await startCheckout(lastWeek.shopper(r), lastWeek.roundId, { [lastWeek.split]: 2 }, now, { slotId: lastWeek.slots[0].id, keepSlotWeekly: true, autoPayFromWallet: true });
      lastBookings.push(await prisma.serviceBooking.findUniqueOrThrow({ where: { roundId_flatId: { roundId: lastWeek.roundId, flatId: r.flatId! } } }));
    }
    const thisWeek = await createServiceRound(lastWeek.actor, { serviceId: lastWeek.ac.id, title: "AC Day 2", cutoffAt: minutes(72 * 60), days: [istDay(6)], repeatWeekly: true }, now);
    if (!thisWeek.ok) throw new Error("no round");
    const slots = await prisma.serviceSlot.findMany({ where: { roundId: thisWeek.roundId }, orderBy: { startsAt: "asc" } });
    const hold = async (r: { id: string; flatId: string | null }, repeatOfBookingId: string) => {
      await takeSeat(prisma, slots[0].id);
      return prisma.serviceBooking.create({
        data: { roundId: thisWeek.roundId, flatId: r.flatId!, slotId: slots[0].id, userId: r.id, status: "HELD", holdExpiresAt: minutes(24 * 60), keepSlotWeekly: true, autoPayFromWallet: true, repeatOfBookingId },
      });
    };
    const richHold = await hold(rich, lastBookings[0].id);
    const shortHold = await hold(short, lastBookings[1].id);
    await topUp(rich.id, 2 * P699);

    expect(await autoPayHold(richHold.id, minutes(1))).toBe("PAID");
    expect(await autoPayHold(shortHold.id, minutes(1))).toBe("NOT_ENOUGH");
    expect(await autoPayHold(richHold.id, minutes(2))).toBe("SKIPPED"); // already booked
    expect(await prisma.serviceBooking.findUniqueOrThrow({ where: { id: richHold.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.serviceBooking.findUniqueOrThrow({ where: { id: shortHold.id } })).toMatchObject({ status: "HELD" });
    const booked = await prisma.orderItem.findFirstOrThrow({ where: { roundId: thisWeek.roundId, userId: rich.id } });
    expect(booked.quantity).toBe(2);
    expect(await walletBalance(prisma, rich.id)).toBe(0);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).bookedCount).toBe(2); // no extra seat taken
  });
});

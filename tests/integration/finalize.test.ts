// Phase 8: the cutoff job. Final prices, refunds, vendor orders, pickups, visits, next week's
// round with held slots, and reminders. Every step must happen exactly once.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { displayStatus } from "@/lib/rounds";
import { confirmPayment, startCheckout, type Shopper } from "@/server/checkout";
import { finalizeRound } from "@/server/finalize";
import { runScheduledJobs, sendCutoffReminders } from "@/server/jobs";
import { createGroceryRound, createServiceRound } from "@/server/rounds";
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
const HOUR = 3_600_000;
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);
const CUTOFF = at(48);
const AFTER = at(48 + 1 / 60); // the job's first run after cutoff
const istDay = (offset: number) => new Date(Date.UTC(2026, 9, 20 + offset) - 330 * 60_000);
const P500 = 50000; // rice, 1+ units
const P465 = 46500; // rice, 20+ units
const P699 = 69900; // split AC, 1+ flats
const P549 = 54900; // split AC, 5+ flats

let seq = 0;
const topUp = (userId: string, amountPaise: number) =>
  prisma.walletTransaction.create({ data: { userId, amountPaise, type: "ADJUSTMENT", idempotencyKey: `TEST:${userId}:${++seq}` } });

const shopperOf = (communityId: string) => (u: { id: string; flatId: string | null }): Shopper => ({ id: u.id, flatId: u.flatId!, communityId });

async function groceryRound(flats = 8) {
  const hood = await makeNeighbourhood(`FIN${++seq}`, flats);
  const catalogue = await makeCatalogue();
  const vendorUser = await prisma.user.create({ data: { phone: nextPhone(), name: "Ramesh", role: "VENDOR", vendorId: catalogue.goods.id } });
  const opened = await createGroceryRound(
    hood.actor,
    { title: "Staples", cutoffAt: CUTOFF, deliveryAt: at(72), requirePickupCode: true, products: [{ productId: catalogue.rice.id, maxQtyPerFlat: 4 }] },
    now,
  );
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const rice = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: opened.roundId } });
  return { ...hood, ...catalogue, vendorUser, roundId: opened.roundId, riceId: rice.id, shopper: shopperOf(hood.community.id) };
}

async function serviceDay({ flats = 8, repeatWeekly = false } = {}) {
  const hood = await makeNeighbourhood(`FSV${++seq}`, flats);
  const catalogue = await makeCatalogue();
  const opened = await createServiceRound(hood.actor, { serviceId: catalogue.ac.id, title: "AC Day", cutoffAt: CUTOFF, days: [istDay(5), istDay(6)], repeatWeekly }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const offerings = await prisma.roundOffering.findMany({ where: { roundId: opened.roundId }, orderBy: { mrpPaise: "desc" } });
  const slots = await prisma.serviceSlot.findMany({ where: { roundId: opened.roundId }, orderBy: { startsAt: "asc" } });
  return { ...hood, ...catalogue, roundId: opened.roundId, split: offerings[0].id, window: offerings[1].id, slots, shopper: shopperOf(hood.community.id) };
}

const notifications = (type: string, userId?: string) => prisma.notification.findMany({ where: { type: type as never, ...(userId ? { userId } : {}) } });

describe("finalizing a grocery round", () => {
  it("sets final prices, refunds the tier difference, issues the vendor order and pickup codes", async () => {
    const s = await groceryRound();
    const buyers = s.residents.slice(1, 7); // six flats, four bags each
    for (const b of buyers) {
      await topUp(b.id, 4 * P500);
      expect(await startCheckout(s.shopper(b), s.roundId, { [s.riceId]: 4 }, at(1))).toMatchObject({ status: "PAID" });
    }
    // The first five paid ₹500 a bag; the sixth joined at 20 bags and paid ₹465. 24 bags end at ₹465.
    const outcome = await finalizeRound(s.roundId, AFTER);
    expect(outcome).toMatchObject({ status: "FINALIZED", confirmedOfferings: 1, droppedOfferings: 0, refundsPaise: 5 * 4 * (P500 - P465), vendorOrders: 1, pickups: 6, visits: 0 });

    const round = await prisma.orderRound.findUniqueOrThrow({ where: { id: s.roundId }, include: { offerings: true } });
    expect(round).toMatchObject({ status: "FINALIZED", finalizedAt: AFTER });
    expect(round.offerings[0]).toMatchObject({ status: "CONFIRMED", finalQty: 24, finalBasisCount: 24, finalUnitPricePaise: P465, finalVendorPricePaise: 42996 });
    for (const b of buyers) {
      expect(await prisma.orderItem.findFirstOrThrow({ where: { roundId: s.roundId, userId: b.id } })).toMatchObject({ status: "CONFIRMED", finalPaise: 4 * P465 });
    }
    for (const b of buyers.slice(0, 5)) expect(await walletBalance(prisma, b.id)).toBe(4 * (P500 - P465));
    expect(await walletBalance(prisma, buyers[5].id)).toBe(4 * (P500 - P465)); // topped up for ₹500 bags, paid ₹465

    const order = await prisma.vendorOrder.findFirstOrThrow({ where: { roundId: s.roundId }, include: { lines: true } });
    expect(order).toMatchObject({ vendorId: s.goods.id, status: "ISSUED", subtotalPaise: 24 * 42996 });
    expect(order.totalPaise).toBe(order.subtotalPaise + order.gstPaise);
    expect(order.lines).toEqual([expect.objectContaining({ offeringId: s.riceId, productId: s.rice.id, quantity: 24, vendorPricePaise: 42996 })]);

    const pickups = await prisma.distributionRecord.findMany({ where: { roundId: s.roundId } });
    expect(pickups.map((p) => p.flatId).sort()).toEqual(buyers.map((b) => b.flatId!).sort());
    expect(pickups.every((p) => /^\d{4}$/.test(p.pickupCode) && p.status === "PENDING")).toBe(true);

    expect(await notifications("REFUND_CREDITED")).toHaveLength(5);
    expect((await notifications("ROUND_FINALIZED")).map((n) => n.userId).sort()).toEqual(buyers.map((b) => b.id).sort());
    expect(await notifications("VENDOR_ORDER", s.vendorUser.id)).toHaveLength(1);

    // Orders are closed for good.
    expect(await startCheckout(s.shopper(s.residents[7]), s.roundId, { [s.riceId]: 1 }, at(49))).toMatchObject({ status: "REJECTED", errors: [{ code: "ROUND_CLOSED" }] });
  });

  it("drops what didn't reach its minimum and refunds it in full", async () => {
    const s = await groceryRound();
    const [a, b] = s.residents.slice(1, 3);
    for (const r of [a, b]) {
      await topUp(r.id, 3 * P500);
      await startCheckout(s.shopper(r), s.roundId, { [s.riceId]: 3 }, at(1)); // 6 bags; the vendor needs 10
    }
    expect(await finalizeRound(s.roundId, AFTER)).toMatchObject({ status: "FINALIZED", confirmedOfferings: 0, droppedOfferings: 1, refundsPaise: 6 * P500, vendorOrders: 0, pickups: 0 });

    const round = await prisma.orderRound.findUniqueOrThrow({ where: { id: s.roundId }, include: { offerings: true } });
    expect(displayStatus(round, AFTER)).toBe("DROPPED");
    expect(round.offerings[0]).toMatchObject({ status: "DROPPED", finalQty: 6, finalUnitPricePaise: null });
    for (const r of [a, b]) {
      expect(await walletBalance(prisma, r.id)).toBe(3 * P500);
      expect(await prisma.walletTransaction.count({ where: { userId: r.id, type: "DROP_REFUND" } })).toBe(1);
    }
    expect(await notifications("ROUND_FINALIZED")).toHaveLength(0);
    expect((await notifications("REFUND_CREDITED")).map((n) => (n.params as { reason: string }).reason)).toEqual(["DROP_REFUND", "DROP_REFUND"]);
  });

  it("runs once even when two jobs race, and never before the cutoff", async () => {
    const s = await groceryRound();
    for (const r of s.residents.slice(1, 7)) {
      await topUp(r.id, 4 * P500);
      await startCheckout(s.shopper(r), s.roundId, { [s.riceId]: 4 }, at(1));
    }
    expect(await finalizeRound(s.roundId, at(47))).toEqual({ status: "NOT_DUE" });

    const results = await Promise.all([finalizeRound(s.roundId, AFTER), finalizeRound(s.roundId, AFTER), runScheduledJobs(AFTER)]);
    const finalized = [results[0], results[1], ...results[2].finalized.map((f) => ({ status: "FINALIZED" as const, ...f }))].filter((r) => r.status === "FINALIZED");
    expect(finalized).toHaveLength(1);
    expect(await prisma.walletTransaction.count({ where: { roundId: s.roundId, type: "TIER_REFUND" } })).toBe(5);
    expect(await prisma.vendorOrder.count({ where: { roundId: s.roundId } })).toBe(1);
    expect(await prisma.distributionRecord.count({ where: { roundId: s.roundId } })).toBe(6);
    expect(await notifications("ROUND_FINALIZED")).toHaveLength(6);

    expect((await runScheduledJobs(at(60))).finalized).toEqual([]);
  });

  it("expires a payment still at the gateway; money that arrives afterwards goes to the wallet", async () => {
    const s = await groceryRound();
    const me = s.residents[1];
    const started = await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 2 }, at(47.9)); // no wallet: pays at the gateway
    expect(started).toMatchObject({ status: "AWAITING_PAYMENT", gatewayPaise: 2 * P500 });
    if (started.status !== "AWAITING_PAYMENT") throw new Error("expected a gateway payment");

    await finalizeRound(s.roundId, AFTER);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: started.paymentId } })).toMatchObject({ status: "EXPIRED" });
    expect(await confirmPayment(started.paymentId, "pay_late", at(48.05))).toMatchObject({ status: "CREDITED_TO_WALLET", amountPaise: 2 * P500 });
    expect(await walletBalance(prisma, me.id)).toBe(2 * P500);
    expect(await prisma.orderItem.count({ where: { roundId: s.roundId, quantity: { gt: 0 } } })).toBe(0);
  });
});

describe("finalizing a Service Day", () => {
  async function book(s: Awaited<ReturnType<typeof serviceDay>>, who: { id: string; flatId: string | null }, slotIndex: number, extra: { keepSlotWeekly?: boolean; autoPayFromWallet?: boolean } = {}) {
    const result = await startCheckout(s.shopper(who), s.roundId, { [s.split]: 1 }, at(1), { slotId: s.slots[slotIndex].id, ...extra });
    expect(result).toMatchObject({ status: "PAID" });
  }

  it("schedules a visit with its own code for every booked flat and releases holds nobody confirmed", async () => {
    const s = await serviceDay();
    const flats = s.residents.slice(1, 6); // five flats: the minimum
    for (const [i, r] of flats.entries()) {
      await topUp(r.id, P699);
      await book(s, r, i < 3 ? 0 : 1); // three in the 9 AM slot (3 technicians), two at 2 PM (2)
    }
    const spouse = await prisma.user.create({ data: { phone: nextPhone(), name: "Spouse", flatId: flats[0].flatId } });
    await topUp(spouse.id, 49000 * 2);
    expect(await startCheckout(s.shopper(spouse), s.roundId, { [s.window]: 1 }, at(2))).toMatchObject({ status: "PAID" }); // shares the flat's visit
    // A weekly hold in the second day's slot that nobody confirmed.
    const unconfirmed = s.residents[6];
    await prisma.serviceSlot.update({ where: { id: s.slots[2].id }, data: { bookedCount: 1 } });
    await prisma.serviceBooking.create({ data: { roundId: s.roundId, flatId: unconfirmed.flatId!, slotId: s.slots[2].id, userId: unconfirmed.id, status: "HELD", holdExpiresAt: at(60) } });

    const outcome = await finalizeRound(s.roundId, AFTER);
    // Five flats reached the ₹549 tier: each split AC buyer gets ₹150 back. Window AC has one price.
    expect(outcome).toMatchObject({ status: "FINALIZED", confirmedOfferings: 2, visits: 5, vendorOrders: 1, refundsPaise: 5 * (P699 - P549) });

    const visits = await prisma.serviceVisit.findMany({ where: { roundId: s.roundId }, include: { booking: true } });
    expect(visits).toHaveLength(5);
    expect(new Set(visits.map((v) => v.flatId))).toEqual(new Set(flats.map((f) => f.flatId)));
    for (const v of visits) {
      expect(v).toMatchObject({ status: "SCHEDULED", kind: "STANDARD", slotId: v.booking.slotId, codeAttempts: 0 });
      expect(v.completionCode).toMatch(/^\d{4}$/);
      expect(v.startsAt).toEqual(s.slots.find((sl) => sl.id === v.slotId)!.startsAt);
    }
    // Everyone with units in a visited flat is told the code: five bookers and the spouse.
    const scheduled = await notifications("VISIT_SCHEDULED");
    expect(scheduled.map((n) => n.userId).sort()).toEqual([...flats.map((f) => f.id), spouse.id].sort());
    const firstFlatVisit = visits.find((v) => v.flatId === flats[0].flatId)!;
    expect(scheduled.find((n) => n.userId === spouse.id)!.params).toMatchObject({ code: firstFlatVisit.completionCode });

    expect(await prisma.serviceBooking.findFirstOrThrow({ where: { roundId: s.roundId, flatId: unconfirmed.flatId! } })).toMatchObject({ status: "CANCELLED" });
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: s.slots[2].id } })).bookedCount).toBe(0);
    const order = await prisma.vendorOrder.findFirstOrThrow({ where: { roundId: s.roundId }, include: { lines: true } });
    expect(order.vendorId).toBe(s.services.id);
    expect(order.lines.map((l) => [l.serviceOptionId, l.quantity]).sort()).toEqual(
      [
        [(await prisma.roundOffering.findUniqueOrThrow({ where: { id: s.split } })).serviceOptionId, 5],
        [(await prisma.roundOffering.findUniqueOrThrow({ where: { id: s.window } })).serviceOptionId, 1],
      ].sort(),
    );
    // Running it again changes nothing.
    expect(await finalizeRound(s.roundId, at(49))).toEqual({ status: "NOT_OPEN" });
    expect(await prisma.serviceVisit.count()).toBe(5);
  });

  it("cancels every booking with a full refund when too few flats booked", async () => {
    const s = await serviceDay();
    const flats = s.residents.slice(1, 4); // three of the five flats needed
    for (const r of flats) {
      await topUp(r.id, P699);
      await book(s, r, 0);
    }
    expect(await finalizeRound(s.roundId, AFTER)).toMatchObject({ status: "FINALIZED", confirmedOfferings: 0, droppedOfferings: 2, visits: 0, vendorOrders: 0, refundsPaise: 3 * P699 });
    expect(await prisma.serviceBooking.count({ where: { roundId: s.roundId, status: { not: "CANCELLED" } } })).toBe(0);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: s.slots[0].id } })).bookedCount).toBe(0);
    for (const r of flats) expect(await walletBalance(prisma, r.id)).toBe(P699);
  });
});

describe("repeating weekly", () => {
  it("opens next week's round once, holds kept slots and books them from the wallet where asked", async () => {
    const s = await serviceDay({ repeatWeekly: true });
    const [rich, short, manual, plainA, plainB] = s.residents.slice(1, 6);
    await topUp(rich.id, 2 * P699);
    await topUp(short.id, P699);
    for (const r of [manual, plainA, plainB]) await topUp(r.id, P699);
    const bookAt = (who: typeof rich, slotIndex: number, prefs: { keepSlotWeekly?: boolean; autoPayFromWallet?: boolean } = {}) =>
      startCheckout(s.shopper(who), s.roundId, { [s.split]: 1 }, at(1), { slotId: s.slots[slotIndex].id, ...prefs });
    await bookAt(rich, 0, { keepSlotWeekly: true, autoPayFromWallet: true });
    await bookAt(short, 0, { keepSlotWeekly: true, autoPayFromWallet: true });
    await bookAt(manual, 1, { keepSlotWeekly: true });
    await bookAt(plainA, 1);
    await bookAt(plainB, 2);

    const outcome = await finalizeRound(s.roundId, AFTER);
    expect(outcome).toMatchObject({ status: "FINALIZED", visits: 5, held: 2, autoPaid: 1 });
    if (outcome.status !== "FINALIZED") throw new Error("expected finalized");

    const next = await prisma.orderRound.findUniqueOrThrow({ where: { repeatOfRoundId: s.roundId }, include: { slots: { orderBy: { startsAt: "asc" } }, offerings: true } });
    expect(outcome.nextRoundId).toBe(next.id);
    expect(next).toMatchObject({ status: "OPEN", kind: "SERVICE", title: "AC Day", repeatWeekly: true, cutoffAt: new Date(CUTOFF.getTime() + 7 * 24 * HOUR) });
    expect(next.slots.map((sl) => sl.startsAt.getTime())).toEqual(s.slots.map((sl) => sl.startsAt.getTime() + 7 * 24 * HOUR));
    expect(next.offerings).toHaveLength(2);

    const bookings = await prisma.serviceBooking.findMany({ where: { roundId: next.id } });
    const of = (u: typeof rich) => bookings.find((b) => b.flatId === u.flatId);
    // Auto-pay with enough in the wallet (this week's ₹150 refund included): booked and paid.
    expect(of(rich)).toMatchObject({ status: "ACTIVE", slotId: next.slots[0].id, keepSlotWeekly: true, autoPayFromWallet: true, holdExpiresAt: null });
    expect(await prisma.orderItem.findFirstOrThrow({ where: { roundId: next.id, userId: rich.id } })).toMatchObject({ quantity: 1, chargedPaise: P699 });
    expect(await walletBalance(prisma, rich.id)).toBe(P699 - P549); // 2 × 699 − 699 + 150 − 699
    // Auto-pay without enough: held for 24 hours like a manual keeper.
    expect(of(short)).toMatchObject({ status: "HELD", slotId: next.slots[0].id, holdExpiresAt: new Date(AFTER.getTime() + 24 * HOUR) });
    expect(of(manual)).toMatchObject({ status: "HELD", slotId: next.slots[1].id });
    expect(of(plainA)).toBeUndefined();
    expect(bookings.every((b) => b.repeatOfBookingId)).toBe(true);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: next.slots[0].id } })).bookedCount).toBe(2);

    expect(await notifications("SLOT_AUTO_BOOKED", rich.id)).toEqual([expect.objectContaining({ params: expect.objectContaining({ amountPaise: P699 }) })]);
    expect((await notifications("SLOT_HELD")).map((n) => n.userId).sort()).toEqual([short.id, manual.id].sort());
    expect(await notifications("ROUND_OPENED", plainA.id)).toHaveLength(2); // this week's and next week's

    // A second run doesn't open another round; holds lapse after 24 hours and free their seats.
    expect((await runScheduledJobs(at(49))).finalized).toEqual([]);
    expect(await prisma.orderRound.count({ where: { repeatOfRoundId: s.roundId } })).toBe(1);
    const later = await runScheduledJobs(new Date(AFTER.getTime() + 25 * HOUR));
    expect(later.expiredHolds).toBe(2);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: next.slots[0].id } })).bookedCount).toBe(1);
    expect((await prisma.serviceSlot.findUniqueOrThrow({ where: { id: next.slots[1].id } })).bookedCount).toBe(0);
  });
});

describe("cutoff reminders", () => {
  it("go to the whole community once, in the last 6 hours", async () => {
    const s = await groceryRound(4);
    const community = s.residents.length + 1; // residents and the captain
    expect(await sendCutoffReminders(at(41))).toBe(0); // 7 hours out
    expect(await sendCutoffReminders(at(43))).toBe(community); // 5 hours out
    expect(await sendCutoffReminders(at(44))).toBe(0);
    expect((await notifications("CUTOFF_REMINDER", s.residents[1].id))[0].params).toMatchObject({ round: "Staples", cutoffAt: CUTOFF.toISOString() });

    // A round opened inside its last 6 hours already said when it closes.
    const late = await createGroceryRound(
      s.actor,
      { title: "Top-up", cutoffAt: at(53), deliveryAt: at(80), requirePickupCode: true, products: [{ productId: s.rice.id, maxQtyPerFlat: 4 }] },
      at(48.5),
    );
    expect(late.ok).toBe(true);
    expect(await sendCutoffReminders(at(50))).toBe(0);
  });
});

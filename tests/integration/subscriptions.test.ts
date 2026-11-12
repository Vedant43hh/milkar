// Phase 16: weekly groceries. Next week's round opens once at cutoff; standing orders move to it;
// auto-pay orders from the wallet when it covers the order and asks to confirm when it doesn't;
// paused ones order nothing and cancelled ones stop.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { startCheckout, type Shopper } from "@/server/checkout";
import { finalizeRound } from "@/server/finalize";
import { createGroceryRound, createServiceRound } from "@/server/rounds";
import { changeSubscription, keepOrderWeekly, listSubscriptions, orderThisWeek } from "@/server/subscriptions";
import { truncateAll } from "../../prisma/truncate";
import { at, HOUR, makeCatalogue, makeNeighbourhood, now, topUp } from "./helpers";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
beforeEach(async () => {
  await truncateAll(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

const WEEK = 7 * 24 * HOUR;
const BAG = 50000; // rice at the first tier
let seq = 0;

/** A weekly rice round where the first `buyers` residents each ordered one bag (wallet topped up by `extra` bags). */
async function weeklyRound(extra: number[]) {
  const hood = await makeNeighbourhood(`SUB${++seq}`, 4);
  const catalogue = await makeCatalogue();
  await prisma.product.update({ where: { id: catalogue.rice.id }, data: { minOrderQty: 1 } });
  const opened = await createGroceryRound(hood.actor, { title: "Weekly rice", cutoffAt: at(48), deliveryAt: at(60), requirePickupCode: false, products: [{ productId: catalogue.rice.id, maxQtyPerFlat: 4 }], repeatWeekly: true }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const offering = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: opened.roundId } });
  const shoppers: Shopper[] = hood.residents.slice(0, extra.length).map((r) => ({ id: r.id, flatId: r.flatId!, communityId: hood.community.id }));
  for (const [i, s] of shoppers.entries()) {
    await topUp(s.id, BAG * (1 + extra[i]));
    expect(await startCheckout(s, opened.roundId, { [offering.id]: 1 }, at(1))).toMatchObject({ status: "PAID" });
  }
  return { ...hood, ...catalogue, roundId: opened.roundId, shoppers };
}

const itemsIn = (roundId: string, userId: string) => prisma.orderItem.findMany({ where: { roundId, userId, quantity: { gt: 0 } } });

describe("weekly groceries", () => {
  it("open next week's round once, with the same products and times a week later", async () => {
    const s = await weeklyRound([0]);
    const first = await finalizeRound(s.roundId, at(48.02));
    expect(first).toMatchObject({ status: "FINALIZED" });
    const nextId = first.status === "FINALIZED" ? first.nextRoundId : null;
    expect(nextId).toBeTruthy();
    const [round, next] = await Promise.all([prisma.orderRound.findUniqueOrThrow({ where: { id: s.roundId } }), prisma.orderRound.findUniqueOrThrow({ where: { id: nextId! }, include: { offerings: true } })]);
    expect(next).toMatchObject({ kind: "GROCERY", repeatWeekly: true, repeatOfRoundId: s.roundId, status: "OPEN", title: "Weekly rice" });
    expect(next.cutoffAt.getTime() - round.cutoffAt.getTime()).toBe(WEEK);
    expect(next.deliveryAt.getTime() - round.deliveryAt.getTime()).toBe(WEEK);
    expect(next.offerings.map((o) => [o.productId, o.maxQtyPerFlat])).toEqual([[s.rice.id, 4]]);
    // Running the cutoff again opens nothing new.
    expect(await prisma.orderRound.count({ where: { repeatOfRoundId: s.roundId } })).toBe(1);
  });

  it("skip to the next week still to come when the cutoff job runs very late", async () => {
    const s = await weeklyRound([0]);
    await keepOrderWeekly(s.shoppers[0], s.roundId, { autoPayFromWallet: false });
    // The server was down: the cutoff runs 8 days after it was due.
    const late = await finalizeRound(s.roundId, at(48 + 8 * 24));
    const nextId = late.status === "FINALIZED" ? late.nextRoundId : null;
    expect(nextId).toBeTruthy();
    const [round, next] = await Promise.all([prisma.orderRound.findUniqueOrThrow({ where: { id: s.roundId } }), prisma.orderRound.findUniqueOrThrow({ where: { id: nextId! } })]);
    expect(next.cutoffAt.getTime() - round.cutoffAt.getTime()).toBe(2 * WEEK);
    expect(next.status).toBe("OPEN");
    // The subscription moved on with it.
    expect(await prisma.standingOrder.count({ where: { roundId: nextId! } })).toBe(1);
  });

  it("keeps an order every week only in a weekly round, and only with something ordered", async () => {
    const s = await weeklyRound([0, 0]);
    const [ordered] = s.shoppers;
    const empty = { id: s.residents[3].id, flatId: s.residents[3].flatId!, communityId: s.community.id };
    expect(await keepOrderWeekly(empty, s.roundId, { autoPayFromWallet: false })).toEqual({ ok: false, error: "NO_ORDER" });
    const service = await createServiceRound(s.actor, { serviceId: s.ac.id, title: "AC Day", cutoffAt: at(48), days: [new Date(Date.UTC(2026, 9, 25) - 330 * 60_000)], repeatWeekly: false }, now);
    if (!service.ok) throw new Error(JSON.stringify(service.errors));
    expect(await keepOrderWeekly(ordered, service.roundId, { autoPayFromWallet: false })).toEqual({ ok: false, error: "NOT_WEEKLY" });
    expect(await keepOrderWeekly(ordered, s.roundId, { autoPayFromWallet: true })).toEqual({ ok: true });
    const [sub] = await listSubscriptions(ordered.id);
    expect(sub).toMatchObject({ status: "ACTIVE", autoPayFromWallet: true, orderedThisWeek: true, items: [{ productId: s.rice.id, quantity: 1, name: "Rice" }] });
  });

  it("orders next week from the wallet when it covers it, and asks to confirm when it doesn't", async () => {
    const s = await weeklyRound([1, 0]); // the first resident has a second bag's worth left over
    const [rich, short] = s.shoppers;
    await keepOrderWeekly(rich, s.roundId, { autoPayFromWallet: true });
    await keepOrderWeekly(short, s.roundId, { autoPayFromWallet: true });
    const result = await finalizeRound(s.roundId, at(48.02));
    if (result.status !== "FINALIZED") throw new Error(result.status);
    expect(result).toMatchObject({ autoPaid: 1, held: 1 });
    const next = result.nextRoundId!;
    expect(await itemsIn(next, rich.id)).toEqual([expect.objectContaining({ quantity: 1 })]);
    expect(await itemsIn(next, short.id)).toEqual([]);
    expect(await prisma.notification.findMany({ where: { userId: { in: [rich.id, short.id] }, type: { in: ["SUBSCRIPTION_ORDERED", "SUBSCRIPTION_CONFIRM"] } }, select: { userId: true, type: true } })).toEqual(
      expect.arrayContaining([
        { userId: rich.id, type: "SUBSCRIPTION_ORDERED" },
        { userId: short.id, type: "SUBSCRIPTION_CONFIRM" },
      ]),
    );
    // Both subscriptions moved to next week; the short one can order there once topped up.
    expect(await prisma.standingOrder.count({ where: { roundId: next } })).toBe(2);
    await topUp(short.id, BAG);
    const [sub] = await listSubscriptions(short.id);
    expect(await orderThisWeek(short, sub.id, at(50))).toMatchObject({ status: "PAID" });
    expect(await itemsIn(next, short.id)).toHaveLength(1);
  });

  it("orders nothing while paused, and stops when cancelled", async () => {
    const s = await weeklyRound([1, 1]);
    const [paused, cancelled] = s.shoppers;
    await keepOrderWeekly(paused, s.roundId, { autoPayFromWallet: true });
    await keepOrderWeekly(cancelled, s.roundId, { autoPayFromWallet: true });
    const [p] = await listSubscriptions(paused.id);
    const [c] = await listSubscriptions(cancelled.id);
    expect(await changeSubscription(paused.id, p.id, "PAUSE")).toEqual({ ok: true });
    expect(await changeSubscription(cancelled.id, c.id, "CANCEL")).toEqual({ ok: true });
    expect(await changeSubscription(cancelled.id, c.id, "RESUME")).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await changeSubscription(paused.id, c.id, "PAUSE")).toEqual({ ok: false, error: "NOT_FOUND" }); // not theirs

    const result = await finalizeRound(s.roundId, at(48.02));
    const next = result.status === "FINALIZED" ? result.nextRoundId! : "";
    expect(await itemsIn(next, paused.id)).toEqual([]);
    expect(await itemsIn(next, cancelled.id)).toEqual([]);
    expect(await prisma.standingOrder.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ roundId: next, status: "PAUSED" });
    expect(await prisma.standingOrder.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ roundId: s.roundId, status: "CANCELLED" });
    expect(await listSubscriptions(cancelled.id)).toEqual([]);
  });
});

// Phase 6: grocery checkout. Money must never be lost, double-spent or applied twice.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { QUOTE_TTL_MS } from "@/lib/pricing/rules";
import { confirmPayment, quoteCart, startCheckout, type Shopper } from "@/server/checkout";
import { cancelRound, createGroceryRound } from "@/server/rounds";
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
const P500 = 50000;
const P465 = 46500;

async function setup({ flats = 3, cap = 4 } = {}) {
  const hood = await makeNeighbourhood(`SHOP${Math.floor(Math.random() * 1e6)}`, flats);
  const { rice } = await makeCatalogue();
  const opened = await createGroceryRound(
    hood.actor,
    { title: "Staples", cutoffAt: minutes(48 * 60), deliveryAt: minutes(72 * 60), requirePickupCode: true, products: [{ productId: rice.id, maxQtyPerFlat: cap }] },
    now,
  );
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const offering = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: opened.roundId } });
  const shopper = (u: { id: string; flatId: string | null }): Shopper => ({ id: u.id, flatId: u.flatId!, communityId: hood.community.id });
  return { ...hood, roundId: opened.roundId, riceId: offering.id, shopper };
}

let creditSeq = 0;
const topUp = (userId: string, amountPaise: number) =>
  prisma.walletTransaction.create({ data: { userId, amountPaise, type: "ADJUSTMENT", idempotencyKey: `TEST:${userId}:${++creditSeq}` } });

const units = async (roundId: string, userId: string) => (await prisma.orderItem.findFirst({ where: { roundId, userId } }))?.quantity ?? 0;

describe("checkout", () => {
  it("applies an order the wallet covers at once, at the tier before the change", async () => {
    const s = await setup();
    const me = s.residents[1];
    await topUp(me.id, 200000);

    const quote = await quoteCart(s.shopper(me), s.roundId, { [s.riceId]: 2 }, now);
    expect(quote.ok && quote.quote).toMatchObject({ chargePaise: 2 * P500, walletAppliedPaise: 2 * P500, gatewayPaise: 0 });

    const result = await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 2 }, now);
    expect(result).toMatchObject({ status: "PAID", unlocked: [] });
    expect(await prisma.orderItem.findFirstOrThrow({ where: { roundId: s.roundId, userId: me.id } })).toMatchObject({ quantity: 2, chargedPaise: 2 * P500, status: "ACTIVE" });
    expect(await walletBalance(prisma, me.id)).toBe(200000 - 2 * P500);
    expect((await prisma.orderRound.findUniqueOrThrow({ where: { id: s.roundId } })).version).toBe(1);
  });

  it("confirms a gateway payment exactly once, even if the confirmation arrives twice at the same time", async () => {
    const s = await setup();
    const me = s.residents[1];
    const started = await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 2 }, now);
    expect(started).toMatchObject({ status: "AWAITING_PAYMENT", provider: "MOCK", gatewayPaise: 2 * P500 });
    if (started.status !== "AWAITING_PAYMENT") return;

    const results = await Promise.all([confirmPayment(started.paymentId, "pay_1", minutes(2)), confirmPayment(started.paymentId, "pay_1", minutes(2))]);
    expect(results.map((r) => r.status)).toEqual(["PAID", "PAID"]);
    expect(results.filter((r) => r.status === "PAID" && r.repeat)).toHaveLength(1);
    expect(await prisma.orderLot.count()).toBe(1);
    expect(await units(s.roundId, me.id)).toBe(2);
    expect(await walletBalance(prisma, me.id)).toBe(0);
  });

  it("credits the wallet instead when the payment arrives after the 15-minute quote expired", async () => {
    const s = await setup();
    const me = s.residents[1];
    const started = await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 1 }, now);
    if (started.status !== "AWAITING_PAYMENT") throw new Error("expected a gateway payment");

    const result = await confirmPayment(started.paymentId, "pay_late", new Date(now.getTime() + QUOTE_TTL_MS));
    expect(result).toEqual({ status: "CREDITED_TO_WALLET", roundId: s.roundId, reason: "EXPIRED", amountPaise: P500 });
    expect(await units(s.roundId, me.id)).toBe(0);
    expect(await walletBalance(prisma, me.id)).toBe(P500);
    // A retried webhook doesn't credit twice.
    await confirmPayment(started.paymentId, "pay_late", new Date(now.getTime() + QUOTE_TTL_MS));
    expect(await walletBalance(prisma, me.id)).toBe(P500);
  });

  it("refuses a stale quote from a second tab, crediting that payment to the wallet", async () => {
    const s = await setup();
    const me = s.residents[1];
    const tabA = await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 1 }, now);
    const tabB = await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 1 }, now);
    if (tabA.status !== "AWAITING_PAYMENT" || tabB.status !== "AWAITING_PAYMENT") throw new Error("expected gateway payments");

    expect((await confirmPayment(tabA.paymentId, "a", minutes(1))).status).toBe("PAID");
    expect(await confirmPayment(tabB.paymentId, "b", minutes(1))).toMatchObject({ status: "CREDITED_TO_WALLET", reason: "ORDER_CHANGED" });
    expect(await units(s.roundId, me.id)).toBe(1);
    expect(await walletBalance(prisma, me.id)).toBe(P500);
  });

  it("holds the per-flat cap when two family members pay at the same moment", async () => {
    const s = await setup({ cap: 4 });
    const flatId = s.residents[1].flatId!;
    const spouse = await prisma.user.create({ data: { phone: nextPhone(), name: "Spouse", flatId } });
    const a = await startCheckout(s.shopper(s.residents[1]), s.roundId, { [s.riceId]: 3 }, now);
    const b = await startCheckout(s.shopper(spouse), s.roundId, { [s.riceId]: 3 }, now);
    if (a.status !== "AWAITING_PAYMENT" || b.status !== "AWAITING_PAYMENT") throw new Error("expected gateway payments");

    const results = await Promise.all([confirmPayment(a.paymentId, "a", minutes(1)), confirmPayment(b.paymentId, "b", minutes(1))]);
    expect(results.map((r) => r.status).sort()).toEqual(["CREDITED_TO_WALLET", "PAID"]);
    expect(results.find((r) => r.status === "CREDITED_TO_WALLET")).toMatchObject({ reason: "FLAT_CAP_EXCEEDED" });
    const flatUnits = await prisma.orderItem.aggregate({ where: { roundId: s.roundId, flatId }, _sum: { quantity: true } });
    expect(flatUnits._sum.quantity).toBe(3);
  });

  it("refunds reductions to the wallet before the freeze, and refuses them after", async () => {
    const s = await setup();
    const me = s.residents[1];
    await topUp(me.id, 3 * P500);
    await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 3 }, now);

    expect(await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 1 }, minutes(60))).toMatchObject({ status: "PAID" });
    expect(await units(s.roundId, me.id)).toBe(1);
    expect(await walletBalance(prisma, me.id)).toBe(2 * P500);

    const frozen = minutes(36 * 60 + 1); // the freeze starts 12 hours before the cutoff (48 h away)
    expect(await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 0 }, frozen)).toEqual({
      status: "REJECTED",
      errors: [{ code: "REDUCTION_FROZEN", offeringId: s.riceId }],
      names: { [s.riceId]: "Rice" },
    });
    expect(await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 2 }, frozen)).toMatchObject({ status: "PAID" }); // adding is still fine
  });

  it("credits the wallet if the manager cancels the round while the resident is paying", async () => {
    const s = await setup();
    const me = s.residents[1];
    const started = await startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 2 }, now);
    if (started.status !== "AWAITING_PAYMENT") throw new Error("expected a gateway payment");
    await cancelRound(s.actor, s.roundId, "Vendor unavailable", minutes(1));
    // The cancellation expired the unpaid quote; money the gateway captured anyway lands in the wallet.
    expect(await confirmPayment(started.paymentId, "late", minutes(2))).toEqual({ status: "CREDITED_TO_WALLET", roundId: s.roundId, reason: "EXPIRED", amountPaise: 2 * P500 });
    expect(await units(s.roundId, me.id)).toBe(0);
    expect(await walletBalance(prisma, me.id)).toBe(2 * P500);
  });

  it("tells everyone holding units when a better tier unlocks, once, and shows the buyer", async () => {
    const s = await setup({ flats: 6, cap: 20 });
    for (const [i, qty] of [5, 5, 5, 4].entries()) {
      await topUp(s.residents[i].id, qty * P500);
      await startCheckout(s.shopper(s.residents[i]), s.roundId, { [s.riceId]: qty }, now);
    }
    const buyer = s.residents[4];
    await topUp(buyer.id, P500);
    const result = await startCheckout(s.shopper(buyer), s.roundId, { [s.riceId]: 1 }, now);
    // The 20th bag is charged at ₹500 (the tier before it), and unlocks ₹465 for everyone.
    expect(result).toMatchObject({ status: "PAID", unlocked: [{ item: "Rice", pricePaise: P465 }] });
    const told = await prisma.notification.findMany({ where: { type: "TIER_UNLOCKED" }, select: { userId: true } });
    expect(told.map((n) => n.userId).sort()).toEqual([...s.residents.slice(0, 5).map((r) => r.id)].sort());

    await topUp(s.residents[5].id, P465);
    await startCheckout(s.shopper(s.residents[5]), s.roundId, { [s.riceId]: 1 }, now);
    expect(await prisma.notification.count({ where: { type: "TIER_UNLOCKED" } })).toBe(5);
  });

  it("never spends the same wallet balance twice across two rounds", async () => {
    const s = await setup();
    const { rice } = { rice: await prisma.product.findFirstOrThrow() };
    const second = await createGroceryRound(
      s.actor,
      { title: "Second", cutoffAt: minutes(48 * 60), deliveryAt: minutes(72 * 60), requirePickupCode: true, products: [{ productId: rice.id, maxQtyPerFlat: 4 }] },
      now,
    );
    if (!second.ok) throw new Error("no second round");
    const otherRice = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: second.roundId } });
    const me = s.residents[1];
    await topUp(me.id, P500);

    const results = await Promise.all([
      startCheckout(s.shopper(me), s.roundId, { [s.riceId]: 1 }, now),
      startCheckout(s.shopper(me), second.roundId, { [otherRice.id]: 1 }, now),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["PAID", "REJECTED"]);
    expect(await walletBalance(prisma, me.id)).toBe(0);
  });
});

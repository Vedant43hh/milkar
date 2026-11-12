import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { itemsFromOrder, nextStanding, readStandingItems, standingTargets, type StandingChange, type StandingItem } from "@/lib/subscriptions";
import { checkoutFromWallet, startCheckout, type CheckoutResult, type Shopper } from "./checkout";
import { notify } from "./notifications";

// Subscriptions: a resident keeps their weekly grocery order. Each standing order sits on the week
// it's for; when that week closes it moves to next week's round, and with auto-pay on, next week is
// ordered and paid from the wallet. Otherwise the resident is asked to confirm and pay.

type Tx = Prisma.TransactionClient;

export type KeepError = "NOT_FOUND" | "NOT_WEEKLY" | "CLOSED" | "NO_ORDER";

/** "Keep my order every week": the resident's order in this week becomes their standing order. */
export async function keepOrderWeekly(shopper: Shopper, roundId: string, prefs: { autoPayFromWallet: boolean }): Promise<{ ok: true } | { ok: false; error: KeepError }> {
  const round = await prisma.orderRound.findFirst({ where: { id: roundId, communityId: shopper.communityId }, select: { kind: true, repeatWeekly: true, status: true } });
  if (!round) return { ok: false, error: "NOT_FOUND" };
  if (round.kind !== "GROCERY" || !round.repeatWeekly) return { ok: false, error: "NOT_WEEKLY" };
  if (round.status === "CANCELLED") return { ok: false, error: "CLOSED" };
  const rows = await prisma.orderItem.findMany({ where: { roundId, userId: shopper.id, quantity: { gt: 0 } }, select: { quantity: true, offering: { select: { productId: true } } } });
  const items = itemsFromOrder(rows.map((r) => ({ productId: r.offering.productId, quantity: r.quantity })));
  if (items.length === 0) return { ok: false, error: "NO_ORDER" };
  const data = { items: items as unknown as Prisma.InputJsonValue, autoPayFromWallet: prefs.autoPayFromWallet, status: "ACTIVE" as const, flatId: shopper.flatId, placedRoundId: roundId };
  await prisma.standingOrder.upsert({ where: { userId_roundId: { userId: shopper.id, roundId } }, create: { userId: shopper.id, roundId, ...data }, update: data });
  return { ok: true };
}

/** The resident's subscriptions (not cancelled), each with its current week. */
export async function listSubscriptions(userId: string) {
  const orders = await prisma.standingOrder.findMany({
    where: { userId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      autoPayFromWallet: true,
      items: true,
      round: {
        select: {
          id: true,
          title: true,
          status: true,
          cutoffAt: true,
          deliveryAt: true,
          offerings: { select: { productId: true, product: { select: { name: true, unit: true, packSize: true } } } },
          orderItems: { where: { userId, quantity: { gt: 0 } }, select: { id: true } },
        },
      },
    },
  });
  const names = new Map<string, string>();
  const products = await prisma.product.findMany({ where: { id: { in: [...new Set(orders.flatMap((o) => readStandingItems(o.items).map((i) => i.productId)))] } }, select: { id: true, name: true } });
  for (const p of products) names.set(p.id, p.name);
  return orders.map(({ round, items, ...o }) => ({
    ...o,
    items: readStandingItems(items).map((i) => ({ ...i, name: names.get(i.productId) ?? "" })),
    round: { id: round.id, title: round.title, status: round.status, cutoffAt: round.cutoffAt, deliveryAt: round.deliveryAt },
    orderedThisWeek: round.orderItems.length > 0,
  }));
}

export type Subscription = Awaited<ReturnType<typeof listSubscriptions>>[number];

/** The resident's standing order on this week's round, if they have one. */
export async function standingOrderFor(userId: string, roundId: string) {
  return prisma.standingOrder.findUnique({ where: { userId_roundId: { userId, roundId } }, select: { id: true, status: true, autoPayFromWallet: true } });
}

async function ownStanding(userId: string, id: string) {
  return prisma.standingOrder.findFirst({ where: { id, userId }, select: { id: true, status: true, roundId: true, items: true, flatId: true } });
}

export async function changeSubscription(userId: string, id: string, change: StandingChange): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "NOT_ALLOWED" }> {
  const standing = await ownStanding(userId, id);
  if (!standing) return { ok: false, error: "NOT_FOUND" };
  const status = nextStanding(standing.status, change);
  if (!status) return { ok: false, error: "NOT_ALLOWED" };
  const { count } = await prisma.standingOrder.updateMany({ where: { id, status: standing.status }, data: { status } });
  return count === 1 ? { ok: true } : { ok: false, error: "NOT_ALLOWED" };
}

export async function setSubscriptionAutoPay(userId: string, id: string, autoPayFromWallet: boolean): Promise<boolean> {
  const { count } = await prisma.standingOrder.updateMany({ where: { id, userId, status: { not: "CANCELLED" } }, data: { autoPayFromWallet } });
  return count === 1;
}

/** Puts this week's standing items in the cart and checks out (wallet first, then UPI). */
export async function orderThisWeek(shopper: Shopper, id: string, now: Date): Promise<CheckoutResult | { status: "NOT_FOUND" }> {
  const standing = await ownStanding(shopper.id, id);
  if (!standing || standing.status === "CANCELLED") return { status: "NOT_FOUND" };
  const offerings = await prisma.roundOffering.findMany({ where: { roundId: standing.roundId }, select: { id: true, productId: true, maxQtyPerFlat: true } });
  return startCheckout(shopper, standing.roundId, standingTargets(readStandingItems(standing.items), offerings), now);
}

// ---------- at cutoff ----------

/**
 * Moves this week's standing orders to next week's round (inside the cutoff, so it's quick). Each
 * takes the resident's order this week if they had one, so changes they made carry on. Nothing is
 * ordered here: placeStandingOrder does that afterwards, one resident at a time.
 */
export async function moveSubscriptions(
  tx: Tx,
  round: { id: string; offerings: { productId: string | null; orderItems: { userId: string; quantity: number }[] }[] },
  nextRoundId: string,
): Promise<void> {
  const standing = await tx.standingOrder.findMany({ where: { roundId: round.id, status: { not: "CANCELLED" } }, include: { user: { select: { flatId: true } } } });
  for (const s of standing) {
    // Moved out of the flat since: the subscription ends with that.
    if (s.user.flatId !== s.flatId) {
      await tx.standingOrder.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
      continue;
    }
    const thisWeek = itemsFromOrder(round.offerings.flatMap((o) => o.orderItems.filter((i) => i.userId === s.userId).map((i) => ({ productId: o.productId, quantity: i.quantity }))));
    const items: StandingItem[] = thisWeek.length > 0 ? thisWeek : readStandingItems(s.items);
    await tx.standingOrder.update({ where: { id: s.id }, data: { roundId: nextRoundId, items: items as unknown as Prisma.InputJsonValue } });
  }
}

/**
 * Places one standing order in the week it's on, once: from the wallet with auto-pay when it
 * covers the order, otherwise the resident is asked to confirm. Its own transaction, under the
 * standing order's row lock, so overlapping runs do it once.
 */
export async function placeStandingOrder(id: string, now: Date): Promise<"PAID" | "TO_CONFIRM" | "SKIPPED"> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "StandingOrder" WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) return "SKIPPED";
    const s = await tx.standingOrder.findUniqueOrThrow({ where: { id }, include: { round: { select: { status: true, title: true, communityId: true } } } });
    if (s.status !== "ACTIVE" || s.placedRoundId === s.roundId || s.round.status !== "OPEN") return "SKIPPED";
    await tx.standingOrder.update({ where: { id }, data: { placedRoundId: s.roundId } });
    // Already ordered this week themselves: nothing to do.
    if ((await tx.orderItem.count({ where: { roundId: s.roundId, userId: s.userId, quantity: { gt: 0 } } })) > 0) return "SKIPPED";
    const offerings = await tx.roundOffering.findMany({ where: { roundId: s.roundId }, select: { id: true, productId: true, maxQtyPerFlat: true } });
    const targets = standingTargets(readStandingItems(s.items), offerings);
    if (Object.keys(targets).length === 0) return "SKIPPED";
    const key = notificationKeys.subscription(s.id, s.roundId);
    if (s.autoPayFromWallet) {
      const result = await checkoutFromWallet(tx, { id: s.userId, flatId: s.flatId, communityId: s.round.communityId }, s.roundId, targets, now);
      if (result.status === "PAID") {
        const payment = await tx.payment.findUniqueOrThrow({ where: { id: result.paymentId }, select: { walletAppliedPaise: true } });
        await notify(tx, [s.userId], { type: "SUBSCRIPTION_ORDERED", params: { round: s.round.title, amountPaise: payment.walletAppliedPaise }, href: `/round/${s.roundId}` }, { dedupeKey: key, now });
        return "PAID";
      }
    }
    await notify(tx, [s.userId], { type: "SUBSCRIPTION_CONFIRM", params: { round: s.round.title }, href: "/app/subscriptions" }, { dedupeKey: key, now });
    return "TO_CONFIRM";
  });
}

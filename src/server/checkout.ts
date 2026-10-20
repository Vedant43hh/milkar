import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { groupBasis } from "@/lib/pricing/basis";
import { lotsKey, quoteChanges, type IdLot, type Quote, type QuoteOffering } from "@/lib/pricing/checkout";
import { unitPriceAt } from "@/lib/pricing/price";
import { checkChange, isQuoteExpired, QUOTE_TTL_MS, type ChangeError } from "@/lib/pricing/rules";
import { tierIndexAt, sortTiers, type Tier } from "@/lib/pricing/tiers";
import { notify } from "./notifications";
import { paymentGateway } from "./payments/gateway";
import { lockRound } from "./round-lock";
import { lockUser, walletBalance } from "./wallet";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

/** The resident placing or changing an order. */
export type Shopper = { id: string; flatId: string; communityId: string };

export type CheckoutError = ChangeError["code"] | "ROUND_NOT_FOUND" | "NOTHING_TO_CHANGE" | "PRICE_CHANGED";

/** A price unlocked by this change: everyone in the group now pays less. */
export type Unlock = { item: string; pricePaise: number };

// ---------- loading the round ----------

async function loadRound(db: Db, roundId: string) {
  return db.orderRound.findUnique({
    where: { id: roundId },
    include: {
      offerings: {
        include: {
          product: { select: { name: true } },
          serviceOption: { select: { name: true } },
          orderItems: {
            select: { id: true, userId: true, flatId: true, quantity: true, lots: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
          },
        },
      },
    },
  });
}

type LoadedRound = NonNullable<Awaited<ReturnType<typeof loadRound>>>;
type LoadedOffering = LoadedRound["offerings"][number];

const offeringName = (o: LoadedOffering) => o.product?.name ?? o.serviceOption?.name ?? "";

/** Each tier group's count in its basis (units or distinct flats), from the round's order items. */
function groupCounts(round: LoadedRound, quantities?: Map<string, number>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of round.offerings) {
    if (counts.has(o.tierGroupKey)) continue;
    const items = round.offerings
      .filter((m) => m.tierGroupKey === o.tierGroupKey)
      .flatMap((m) => m.orderItems.map((i) => ({ flatId: i.flatId, quantity: quantities?.get(i.id) ?? i.quantity })));
    counts.set(o.tierGroupKey, groupBasis(items, o.tierBasis));
  }
  return counts;
}

function userLots(o: LoadedOffering, userId: string): IdLot[] {
  const item = o.orderItems.find((i) => i.userId === userId);
  return (item?.lots ?? []).map((l, index) => ({ id: l.id, quantity: l.quantity, unitPricePaise: l.unitPricePaise, seq: index + 1 }));
}

function flatOthersQty(o: LoadedOffering, shopper: Pick<Shopper, "id" | "flatId">): number {
  return o.orderItems.filter((i) => i.flatId === shopper.flatId && i.userId !== shopper.id).reduce((n, i) => n + i.quantity, 0);
}

function quoteOfferings(round: LoadedRound, shopper: Pick<Shopper, "id" | "flatId">): QuoteOffering[] {
  const counts = groupCounts(round);
  return round.offerings.map((o) => ({
    offeringId: o.id,
    pricing: { tiers: o.tiers as Tier[], marginBps: round.marginBps, gstBps: o.gstBps },
    active: o.status === "ACTIVE",
    maxQtyPerFlat: o.maxQtyPerFlat,
    basisCount: counts.get(o.tierGroupKey)!,
    flatOthersQty: flatOthersQty(o, shopper),
    userLots: userLots(o, shopper.id),
  }));
}

/** Only whole, non-negative quantities for this round's offerings are considered. */
function cleanTargets(round: LoadedRound, targets: Record<string, number>): Record<string, number> {
  const ids = new Set(round.offerings.map((o) => o.id));
  return Object.fromEntries(Object.entries(targets).filter(([id]) => ids.has(id)));
}

export type CheckoutErrors = (ChangeError | { code: CheckoutError; offeringId?: string; maxAllowed?: number })[];
/** `names` maps offering ids to product or option names, for messages. */
export type QuoteResult = { ok: true; quote: Quote; names: Record<string, string> } | { ok: false; errors: CheckoutErrors; names: Record<string, string> };

async function quoteWith(db: Db, shopper: Shopper, roundId: string, targets: Record<string, number>, now: Date): Promise<{ result: QuoteResult; round: LoadedRound | null }> {
  const round = await loadRound(db, roundId);
  // Service Days need a time slot as well; their booking flow arrives with the services screens.
  if (!round || round.communityId !== shopper.communityId || round.kind !== "GROCERY") {
    return { result: { ok: false, errors: [{ code: "ROUND_NOT_FOUND" }], names: {} }, round: null };
  }
  const names = Object.fromEntries(round.offerings.map((o) => [o.id, offeringName(o)]));
  const quoted = quoteChanges({
    round,
    now,
    offerings: quoteOfferings(round, shopper),
    targets: cleanTargets(round, targets),
    walletBalancePaise: await walletBalance(db, shopper.id),
  });
  if (!quoted.ok) return { result: { ok: false, errors: quoted.errors, names }, round };
  if (quoted.quote.lines.length === 0) return { result: { ok: false, errors: [{ code: "NOTHING_TO_CHANGE" }], names }, round };
  return { result: { ok: true, quote: quoted.quote, names }, round };
}

/** Prices a cart against the round as it is right now. Nothing is saved. */
export async function quoteCart(shopper: Shopper, roundId: string, targets: Record<string, number>, now: Date): Promise<QuoteResult> {
  return (await quoteWith(prisma, shopper, roundId, targets, now)).result;
}

// ---------- applying a paid change ----------

async function applyPayment(
  tx: Tx,
  round: LoadedRound,
  payment: { id: string; userId: string; providerPaymentId?: string | null },
  flatId: string,
  quote: Quote,
  now: Date,
): Promise<Unlock[]> {
  const before = groupCounts(round);
  const quantities = new Map<string, number>();
  const touched = new Set<string>();

  for (const line of quote.lines) {
    const offering = round.offerings.find((o) => o.id === line.offeringId)!;
    touched.add(offering.tierGroupKey);
    const existing = offering.orderItems.find((i) => i.userId === payment.userId);
    if (line.addQty > 0) {
      const itemId =
        existing?.id ??
        (await tx.orderItem.create({ data: { roundId: round.id, offeringId: offering.id, userId: payment.userId, flatId, createdAt: now } })).id;
      await tx.orderLot.create({ data: { orderItemId: itemId, quantity: line.addQty, unitPricePaise: line.addUnitPaise, paymentId: payment.id, createdAt: now } });
      await tx.orderItem.update({ where: { id: itemId }, data: { quantity: { increment: line.addQty }, chargedPaise: { increment: line.addPaise }, status: "ACTIVE" } });
      quantities.set(itemId, (existing?.quantity ?? 0) + line.addQty);
      if (!existing) offering.orderItems.push({ id: itemId, userId: payment.userId, flatId, quantity: 0, lots: [] });
    } else if (line.removeQty > 0 && existing) {
      for (const removal of line.removals) {
        const lot = existing.lots.find((l) => l.id === removal.lotId)!;
        if (lot.quantity === removal.units) await tx.orderLot.delete({ where: { id: lot.id } });
        else await tx.orderLot.update({ where: { id: lot.id }, data: { quantity: { decrement: removal.units } } });
      }
      const left = existing.quantity - line.removeQty;
      await tx.orderItem.update({
        where: { id: existing.id },
        data: { quantity: left, chargedPaise: { decrement: line.creditPaise }, status: left === 0 ? "CANCELLED" : "ACTIVE" },
      });
      quantities.set(existing.id, left);
    }
  }

  if (quote.creditPaise > 0) {
    await tx.walletTransaction.create({
      data: { userId: payment.userId, amountPaise: quote.creditPaise, type: "CANCEL_REFUND", roundId: round.id, paymentId: payment.id, idempotencyKey: `CANCEL_REFUND:${payment.id}`, createdAt: now },
    });
  }
  if (quote.walletAppliedPaise > 0) {
    await tx.walletTransaction.create({
      data: { userId: payment.userId, amountPaise: -quote.walletAppliedPaise, type: "ORDER_DEBIT", roundId: round.id, paymentId: payment.id, idempotencyKey: `ORDER_DEBIT:${payment.id}`, createdAt: now },
    });
  }
  await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID", paidAt: now, providerPaymentId: payment.providerPaymentId ?? undefined } });
  await tx.orderRound.update({ where: { id: round.id }, data: { version: { increment: 1 } } });

  // A better tier for a whole group: tell everyone holding units in it, once per tier.
  const after = groupCounts(round, quantities);
  const unlocks: Unlock[] = [];
  for (const key of touched) {
    const members = round.offerings.filter((o) => o.tierGroupKey === key);
    const tiers = members[0].tiers as Tier[];
    const from = tierIndexAt(tiers, before.get(key)!);
    const to = tierIndexAt(tiers, after.get(key)!);
    if (to <= from) continue;
    const minQty = sortTiers(tiers)[to].minQty;
    for (const o of members) {
      const pricePaise = unitPriceAt({ tiers: o.tiers as Tier[], marginBps: round.marginBps, gstBps: o.gstBps }, after.get(key)!).totalPaise;
      const holders = o.orderItems.filter((i) => (quantities.get(i.id) ?? i.quantity) > 0).map((i) => i.userId);
      if (holders.includes(payment.userId) || quote.lines.some((l) => l.offeringId === o.id)) unlocks.push({ item: offeringName(o), pricePaise });
      await notify(
        tx,
        holders,
        { type: "TIER_UNLOCKED", params: { item: offeringName(o), pricePaise }, href: `/round/${round.id}` },
        { dedupeKey: notificationKeys.tierUnlocked(round.id, key, minQty), now },
      );
    }
  }
  return unlocks;
}

// ---------- checkout ----------

export type CheckoutResult =
  | { status: "PAID"; paymentId: string; roundId: string; unlocked: Unlock[] }
  | { status: "AWAITING_PAYMENT"; paymentId: string; roundId: string; provider: "MOCK" | "RAZORPAY"; providerOrderId: string; gatewayPaise: number }
  | { status: "REJECTED"; errors: CheckoutErrors; names: Record<string, string> };

/**
 * Turns a cart into an order change. If the wallet covers it (or it only removes units) it is
 * applied at once under the round and wallet locks. Otherwise a payment valid for 15 minutes is
 * created and confirmed after the resident pays at the gateway.
 */
export async function startCheckout(shopper: Shopper, roundId: string, targets: Record<string, number>, now: Date): Promise<CheckoutResult> {
  const preview = (await quoteWith(prisma, shopper, roundId, targets, now)).result;
  if (!preview.ok) return { status: "REJECTED", errors: preview.errors, names: preview.names };

  if (preview.quote.gatewayPaise === 0) {
    return prisma.$transaction(async (tx): Promise<CheckoutResult> => {
      await lockRound(tx, roundId);
      await lockUser(tx, shopper.id);
      const { result, round } = await quoteWith(tx, shopper, roundId, targets, now);
      if (!result.ok) return { status: "REJECTED", errors: result.errors, names: result.names };
      if (result.quote.gatewayPaise > 0) return { status: "REJECTED", errors: [{ code: "PRICE_CHANGED" }], names: result.names };
      const payment = await tx.payment.create({ data: paymentData(shopper.id, roundId, result.quote, "WALLET", now) });
      const unlocked = await applyPayment(tx, round!, payment, shopper.flatId, result.quote, now);
      return { status: "PAID", paymentId: payment.id, roundId, unlocked };
    });
  }

  const gateway = paymentGateway();
  const payment = await prisma.payment.create({ data: paymentData(shopper.id, roundId, preview.quote, gateway.provider, now) });
  const { providerOrderId } = await gateway.createOrder({ paymentId: payment.id, amountPaise: preview.quote.gatewayPaise });
  await prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId } });
  return { status: "AWAITING_PAYMENT", paymentId: payment.id, roundId, provider: gateway.provider, providerOrderId, gatewayPaise: preview.quote.gatewayPaise };
}

function paymentData(userId: string, roundId: string, quote: Quote, provider: "WALLET" | "MOCK" | "RAZORPAY", now: Date): Prisma.PaymentUncheckedCreateInput {
  return {
    userId,
    roundId,
    changes: quote as unknown as Prisma.InputJsonValue,
    chargePaise: quote.chargePaise,
    creditPaise: quote.creditPaise,
    walletAppliedPaise: quote.walletAppliedPaise,
    gatewayPaise: quote.gatewayPaise,
    provider,
    status: "CREATED",
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
    createdAt: now,
  };
}

export type ConfirmFailure = "EXPIRED" | "ORDER_CHANGED" | "ROUND_CLOSED" | "REDUCTION_FROZEN" | "FLAT_CAP_EXCEEDED" | "OFFERING_UNAVAILABLE" | "WALLET_CHANGED";

export type ConfirmResult =
  | { status: "PAID"; roundId: string; unlocked: Unlock[]; repeat: boolean }
  | { status: "CREDITED_TO_WALLET"; roundId: string; reason: ConfirmFailure | string; amountPaise: number }
  | { status: "NOT_FOUND" };

/**
 * Called once the gateway reports the money captured. Re-checks everything under the locks: the
 * quote is still fresh, the resident's order hasn't changed since, the round still allows the
 * change, family caps hold and the wallet still covers its part. If anything fails, the captured
 * money goes to the wallet instead. Safe to call twice.
 */
export async function confirmPayment(paymentId: string, providerPaymentId: string, now: Date): Promise<ConfirmResult> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.payment.findUnique({ where: { id: paymentId }, select: { roundId: true, userId: true } });
    if (!found) return { status: "NOT_FOUND" };
    await lockRound(tx, found.roundId);
    await lockUser(tx, found.userId);
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const roundId = payment.roundId;
    if (payment.status === "PAID") return { status: "PAID", roundId, unlocked: [], repeat: true };
    if (payment.status === "CREDITED_TO_WALLET") return { status: "CREDITED_TO_WALLET", roundId, reason: payment.failureReason ?? "", amountPaise: payment.gatewayPaise };

    const creditInstead = async (reason: ConfirmFailure): Promise<ConfirmResult> => {
      await tx.walletTransaction.create({
        data: {
          userId: payment.userId,
          amountPaise: payment.gatewayPaise,
          type: "LATE_PAYMENT_CREDIT",
          roundId,
          paymentId,
          idempotencyKey: `LATE_PAYMENT_CREDIT:${paymentId}`,
          note: reason,
          createdAt: now,
        },
      });
      await tx.payment.update({ where: { id: paymentId }, data: { status: "CREDITED_TO_WALLET", failureReason: reason, providerPaymentId, paidAt: now } });
      return { status: "CREDITED_TO_WALLET", roundId, reason, amountPaise: payment.gatewayPaise };
    };

    // This only runs once the gateway has captured the money, so a payment that stopped waiting for
    // it (expired, or the round was cancelled) still ends up in the wallet.
    if (payment.status !== "CREATED" || isQuoteExpired(payment.expiresAt, now)) return creditInstead("EXPIRED");
    const user = await tx.user.findUniqueOrThrow({ where: { id: payment.userId }, select: { flatId: true } });
    const round = await loadRound(tx, roundId);
    if (!round || !user.flatId) return creditInstead("ROUND_CLOSED");
    const shopper = { id: payment.userId, flatId: user.flatId };
    const quote = payment.changes as unknown as Quote;

    for (const line of quote.lines) {
      const offering = round.offerings.find((o) => o.id === line.offeringId);
      if (!offering) return creditInstead("OFFERING_UNAVAILABLE");
      const lots = userLots(offering, shopper.id);
      if (lotsKey(lots) !== line.baseLotsKey) return creditInstead("ORDER_CHANGED");
      const error = checkChange({
        round,
        now,
        offeringId: offering.id,
        offeringActive: offering.status === "ACTIVE",
        currentQty: line.baseQty,
        targetQty: line.targetQty,
        flatOthersQty: flatOthersQty(offering, shopper),
        maxQtyPerFlat: offering.maxQtyPerFlat,
      });
      if (error) return creditInstead(error.code === "INVALID_QUANTITY" ? "ORDER_CHANGED" : error.code);
    }
    const balance = await walletBalance(tx, shopper.id);
    if (balance + quote.creditPaise < quote.walletAppliedPaise) return creditInstead("WALLET_CHANGED");

    const unlocked = await applyPayment(tx, round, { id: paymentId, userId: payment.userId, providerPaymentId }, shopper.flatId, quote, now);
    return { status: "PAID", roundId, unlocked, repeat: false };
  });
}

/** The resident declined at the gateway: the quote is dropped and nothing changes. */
export async function failPayment(paymentId: string, userId: string, reason: string): Promise<boolean> {
  const { count } = await prisma.payment.updateMany({ where: { id: paymentId, userId, status: "CREATED" }, data: { status: "FAILED", failureReason: reason } });
  return count === 1;
}

/** A resident's own payment, for the payment screen. */
export async function getPaymentForUser(paymentId: string, userId: string) {
  return prisma.payment.findFirst({
    where: { id: paymentId, userId },
    select: { id: true, status: true, gatewayPaise: true, chargePaise: true, walletAppliedPaise: true, provider: true, providerOrderId: true, expiresAt: true, roundId: true, round: { select: { title: true } } },
  });
}

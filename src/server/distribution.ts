import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { canManageCommunity } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { checkDeliveryIssue, distributionProgress, pickupCodeMatches, type DeliveryIssueError } from "@/lib/manager-rules";
import { notificationKeys } from "@/lib/notifications";
import { buildPackingList } from "@/lib/pricing/consolidate";
import { deliveryIssueRefund, shortDeliveryRefundKey } from "@/lib/pricing/delivery";
import { applyBps } from "@/lib/pricing/money";
import { notify } from "./notifications";
import { lockRound } from "./round-lock";
import type { Actor } from "./rounds";

// Distribution day for a grocery round: every flat's bag, checked against its pickup code and
// marked collected; short or damaged units refunded to the wallet at what was paid for them. The
// round is complete once every flat has collected. Every change takes the round lock.

type Tx = Prisma.TransactionClient;

/** Grocery rounds waiting to be handed out, and the latest ones done. */
export async function listDistributionRounds(communityId: string) {
  const rounds = await prisma.orderRound.findMany({
    where: { communityId, kind: "GROCERY", status: { in: ["FINALIZED", "COMPLETED"] } },
    orderBy: [{ deliveryAt: "desc" }],
    take: 12,
    select: { id: true, title: true, status: true, deliveryAt: true, distributionRecords: { select: { status: true } } },
  });
  return rounds.map((r) => ({ ...r, progress: distributionProgress(r.distributionRecords) }));
}

/** Everything the distribution checklist shows, or null if it isn't the actor's round. */
export async function getDistribution(actor: Actor, roundId: string) {
  const round = await prisma.orderRound.findFirst({
    where: { id: roundId, kind: "GROCERY", status: { in: ["FINALIZED", "COMPLETED"] } },
    select: {
      id: true,
      title: true,
      status: true,
      communityId: true,
      deliveryAt: true,
      completedAt: true,
      requirePickupCode: true,
      community: { select: { unitLabel: true } },
      distributionRecords: { select: { flatId: true, pickupCode: true, status: true, collectedAt: true, collectedBy: { select: { name: true } } } },
      orderItems: {
        where: { status: "CONFIRMED", quantity: { gt: 0 } },
        select: {
          id: true,
          flatId: true,
          quantity: true,
          shortQty: true,
          damagedQty: true,
          issueRefundPaise: true,
          user: { select: { name: true } },
          flat: { select: { tower: true, number: true } },
          offering: { select: { productId: true, product: { select: { name: true } } } },
        },
      },
    },
  });
  if (!round || !canManageCommunity(actor, round.communityId)) return null;

  const packing = buildPackingList(
    round.orderItems.map((i) => ({
      flatId: i.flatId,
      tower: i.flat.tower,
      flatNumber: i.flat.number,
      productId: i.offering.productId ?? i.id,
      productName: i.offering.product?.name ?? "",
      quantity: i.quantity,
    })),
  );
  const flats = packing.map((flat) => {
    const record = round.distributionRecords.find((d) => d.flatId === flat.flatId) ?? null;
    return {
      ...flat,
      pickup: record ? { status: record.status, collectedAt: record.collectedAt, collectedBy: record.collectedBy?.name ?? null } : null,
      // Each resident's own items, for reporting short or damaged units.
      orderItems: round.orderItems
        .filter((i) => i.flatId === flat.flatId)
        .map((i) => ({ id: i.id, name: i.offering.product?.name ?? "", owner: i.user.name, quantity: i.quantity, shortQty: i.shortQty, damagedQty: i.damagedQty, refundPaise: i.issueRefundPaise })),
    };
  });
  return {
    round: { id: round.id, title: round.title, status: round.status, deliveryAt: round.deliveryAt, completedAt: round.completedAt, requirePickupCode: round.requirePickupCode, unitLabel: round.community.unitLabel },
    flats,
    progress: distributionProgress(round.distributionRecords),
  };
}

export type CollectError = "NOT_FOUND" | "WRONG_CODE" | "ALREADY_COLLECTED" | "ROUND_CLOSED";

/** Hands a flat its bag: the code must match (if the round asks for codes). Completes the round with the last flat. */
export async function collectPickup(actor: Actor, roundId: string, flatId: string, code: string, now: Date): Promise<{ ok: true; completed: boolean } | { ok: false; error: CollectError }> {
  return prisma.$transaction(async (tx) => {
    await lockRound(tx, roundId);
    const round = await tx.orderRound.findFirst({ where: { id: roundId, kind: "GROCERY" }, select: { status: true, communityId: true, requirePickupCode: true } });
    if (!round || !canManageCommunity(actor, round.communityId)) return { ok: false, error: "NOT_FOUND" } as const;
    if (round.status !== "FINALIZED") return { ok: false, error: "ROUND_CLOSED" } as const;
    const record = await tx.distributionRecord.findUnique({ where: { roundId_flatId: { roundId, flatId } }, select: { pickupCode: true, status: true } });
    if (!record) return { ok: false, error: "NOT_FOUND" } as const;
    if (record.status === "COLLECTED") return { ok: false, error: "ALREADY_COLLECTED" } as const;
    if (round.requirePickupCode && !pickupCodeMatches(record.pickupCode, code)) return { ok: false, error: "WRONG_CODE" } as const;
    await tx.distributionRecord.update({ where: { roundId_flatId: { roundId, flatId } }, data: { status: "COLLECTED", collectedAt: now, collectedById: actor.id } });
    const progress = distributionProgress(await tx.distributionRecord.findMany({ where: { roundId }, select: { status: true } }));
    if (progress.done) await tx.orderRound.update({ where: { id: roundId }, data: { status: "COMPLETED", completedAt: now } });
    return { ok: true, completed: progress.done } as const;
  });
}

export type DeliveryReportError = DeliveryIssueError | "NOT_FOUND";

/**
 * Records short and damaged units for one resident's item (cumulative counts that can only grow)
 * and refunds the new ones to their wallet at what they paid, highest-priced units first. Sending
 * the same counts again refunds nothing. The vendor is paid less for the missing goods.
 */
export async function reportDeliveryIssue(
  actor: Actor,
  orderItemId: string,
  input: { short: number; damaged: number; note?: string },
  now: Date,
): Promise<{ ok: true; refundPaise: number } | { ok: false; error: DeliveryReportError }> {
  const found = await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { roundId: true } });
  if (!found) return { ok: false, error: "NOT_FOUND" };
  return prisma.$transaction(async (tx) => {
    await lockRound(tx, found.roundId);
    const item = await tx.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      select: {
        id: true,
        userId: true,
        flatId: true,
        status: true,
        quantity: true,
        shortQty: true,
        damagedQty: true,
        lots: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { quantity: true, unitPricePaise: true } },
        round: { select: { id: true, title: true, kind: true, status: true, communityId: true } },
        offering: { select: { vendorId: true, gstBps: true, finalUnitPricePaise: true, finalVendorPricePaise: true } },
      },
    });
    const { round } = item;
    if (!canManageCommunity(actor, round.communityId) || round.kind !== "GROCERY" || !["FINALIZED", "COMPLETED"].includes(round.status) || item.status !== "CONFIRMED") {
      return { ok: false, error: "NOT_FOUND" } as const;
    }
    const problem = checkDeliveryIssue({ quantity: item.quantity, prevShort: item.shortQty, prevDamaged: item.damagedQty, short: input.short, damaged: input.damaged });
    if (problem) return { ok: false, error: problem } as const;

    const lots = item.lots.map((l, i) => ({ quantity: l.quantity, unitPricePaise: l.unitPricePaise, seq: i + 1 }));
    const finalUnit = item.offering.finalUnitPricePaise ?? 0;
    const before = item.shortQty + item.damagedQty;
    const afterShort = before + (input.short - item.shortQty);
    const after = input.short + input.damaged;
    // Short units first, then damaged: each record knows its own refund.
    const shortRefund = deliveryIssueRefund(lots, finalUnit, before, afterShort);
    const damagedRefund = deliveryIssueRefund(lots, finalUnit, afterShort, after);
    const refundPaise = shortRefund + damagedRefund;
    if (after === before) return { ok: true, refundPaise: 0 } as const;

    await tx.orderItem.update({ where: { id: item.id }, data: { shortQty: input.short, damagedQty: input.damaged, issueRefundPaise: { increment: refundPaise } } });
    const note = input.note?.trim().slice(0, 200) || null;
    const records: Prisma.OrderIssueCreateManyInput[] = [];
    if (input.short > item.shortQty) records.push({ roundId: round.id, flatId: item.flatId, orderItemId: item.id, reason: "SHORT", quantity: input.short - item.shortQty, refundPaise: shortRefund, note, createdById: actor.id, createdAt: now });
    if (input.damaged > item.damagedQty) records.push({ roundId: round.id, flatId: item.flatId, orderItemId: item.id, reason: "DAMAGED", quantity: input.damaged - item.damagedQty, refundPaise: damagedRefund, note, createdById: actor.id, createdAt: now });
    await tx.orderIssue.createMany({ data: records });

    if (refundPaise > 0) {
      const key = shortDeliveryRefundKey(item.id, after);
      await tx.walletTransaction.create({ data: { userId: item.userId, amountPaise: refundPaise, type: "SHORT_DELIVERY_REFUND", roundId: round.id, orderItemId: item.id, idempotencyKey: key, createdAt: now } });
      await notify(
        tx,
        [item.userId],
        { type: "REFUND_CREDITED", params: { amountPaise: refundPaise, reason: "SHORT_DELIVERY_REFUND", round: round.title }, href: "/app/wallet" },
        { dedupeKey: notificationKeys.refund(key), now },
      );
    }
    await payVendorLess(tx, round.id, item.offering, after - before, now);
    return { ok: true, refundPaise } as const;
  });
}

/** The vendor isn't paid for goods that never arrived whole: their price plus GST, per unit. */
async function payVendorLess(tx: Tx, roundId: string, offering: { vendorId: string; gstBps: number; finalVendorPricePaise: number | null }, units: number, now: Date) {
  const order = await tx.vendorOrder.findUnique({ where: { roundId_vendorId: { roundId, vendorId: offering.vendorId } }, select: { id: true } });
  if (!order || units <= 0) return;
  const taxable = units * (offering.finalVendorPricePaise ?? 0);
  await tx.vendorAdjustment.create({
    data: { vendorOrderId: order.id, type: "ISSUE_REFUND", amountPaise: -(taxable + applyBps(taxable, offering.gstBps)), note: `${units} short or damaged`, createdAt: now },
  });
}

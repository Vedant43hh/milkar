import "server-only";
import type { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { applyBps } from "@/lib/pricing/money";
import { allocateNoAccessRefunds, noAccessRefund, noAccessRefundKey, noAccessVendorAdjustment, visitCancelRefundKey } from "@/lib/services/no-access";
import { transitionVisit, type VisitActor, type VisitTransition } from "@/lib/services/visit";
import { resolveByRevisit } from "./issues";
import { notify } from "./notifications";
import { refundParts } from "./parts";
import { lockRound } from "./round-lock";

// Moving a service visit along: on the way, started, done (with the resident's code), couldn't
// get in, or cancelled. The money follows the visit: a no-access visit refunds what was paid minus
// the visit fee; a cancelled one refunds everything, parts included. Every step takes the round
// lock, like parts and checkout.

type Tx = Prisma.TransactionClient;

/** Who is acting: a technician on their own visits, the vendor on its visits, a manager on the community's, an admin anywhere. */
export type VisitUser = { id: string; role: Role; name: string | null; vendorId: string | null; managesCommunityId: string | null };

export type MoveError = "NOT_FOUND" | "INVALID_TRANSITION" | "NOT_ALLOWED" | "CODE_REQUIRED" | "CODE_LOCKED" | "WRONG_CODE" | "PARTS_PENDING";
export type MoveResult = { ok: true; status: VisitTransition["to"] } | { ok: false; error: MoveError; attemptsLeft?: number };

function actorFor(user: VisitUser, visit: { technicianId: string | null; round: { vendorId: string | null; communityId: string } }): VisitActor | null {
  if (user.role === "TECHNICIAN" && visit.technicianId === user.id) return "VENDOR";
  if (user.role === "VENDOR" && user.vendorId !== null && visit.round.vendorId === user.vendorId) return "VENDOR";
  if (user.role === "MANAGER" && user.managesCommunityId === visit.round.communityId) return "MANAGER";
  if (user.role === "ADMIN") return "ADMIN";
  return null;
}

export async function moveVisit(user: VisitUser, visitId: string, step: { to: VisitTransition["to"]; code?: string; reason?: string }, now: Date): Promise<MoveResult> {
  const found = await prisma.serviceVisit.findUnique({ where: { id: visitId }, select: { roundId: true } });
  if (!found) return { ok: false, error: "NOT_FOUND" };
  return prisma.$transaction(async (tx): Promise<MoveResult> => {
    await lockRound(tx, found.roundId);
    const visit = await tx.serviceVisit.findUniqueOrThrow({
      where: { id: visitId },
      select: {
        id: true,
        kind: true,
        revisitOfId: true,
        status: true,
        completionCode: true,
        codeAttempts: true,
        technicianId: true,
        technicianName: true,
        flatId: true,
        roundId: true,
        round: { select: { title: true, vendorId: true, communityId: true, noAccessFeePaise: true, service: { select: { name: true, noAccessFeePaise: true } } } },
        partsRequests: { select: { id: true, status: true } },
      },
    });
    const actor = actorFor(user, visit);
    if (!actor) return { ok: false, error: "NOT_FOUND" };
    if (step.to === "COMPLETED" && visit.partsRequests.some((r) => r.status === "PENDING")) return { ok: false, error: "PARTS_PENDING" };

    const result = transitionVisit(visit, { to: step.to, actor, now, code: step.code });
    if (!result.ok) {
      if (result.error === "WRONG_CODE") {
        await tx.serviceVisit.update({ where: { id: visitId }, data: { codeAttempts: result.codeAttempts } });
        return { ok: false, error: "WRONG_CODE", attemptsLeft: result.attemptsLeft };
      }
      return { ok: false, error: result.error };
    }
    await tx.serviceVisit.update({
      where: { id: visitId },
      data: { status: result.status, [result.stamp]: now, ...(result.status === "CANCELLED" ? { cancelReason: step.reason?.trim().slice(0, 200) || null } : {}) },
    });

    const service = visit.round.service?.name ?? visit.round.title;
    const residents = await household(tx, visit.flatId);
    if (result.status === "ON_THE_WAY") {
      await notify(tx, residents, { type: "TECHNICIAN_ON_THE_WAY", params: { service, technician: visit.technicianName ?? user.name ?? "" }, href: `/app/orders/${visit.roundId}` }, { dedupeKey: notificationKeys.visit(visitId, "ON_THE_WAY"), now });
    } else if (result.status === "COMPLETED") {
      await notify(tx, residents, { type: "VISIT_COMPLETED", params: { service }, href: `/app/orders/${visit.roundId}` }, { dedupeKey: notificationKeys.visit(visitId, "COMPLETED"), now });
      // A free revisit done answers the complaint that asked for it.
      if (visit.revisitOfId) await resolveByRevisit(tx, visit.revisitOfId, now);
    } else if (result.money === "NO_ACCESS_REFUND") {
      const fee = visit.round.noAccessFeePaise ?? visit.round.service?.noAccessFeePaise ?? 0;
      const { refundedPaise, feeKeptPaise } = await noAccessRefunds(tx, visit, fee, now);
      await notify(tx, residents, { type: "VISIT_NO_ACCESS", params: { refundPaise: refundedPaise, feePaise: feeKeptPaise }, href: `/app/orders/${visit.roundId}` }, { dedupeKey: notificationKeys.visit(visitId, "NO_ACCESS"), now });
    } else if (result.money === "FULL_REFUND") {
      await cancelRefunds(tx, visit, now);
    }
    return { ok: true, status: result.status };
  });
}

async function household(tx: Tx, flatId: string): Promise<string[]> {
  const users = await tx.user.findMany({ where: { flatId, role: "RESIDENT" }, select: { id: true } });
  return users.map((u) => u.id);
}

type MovedVisit = { id: string; kind: string; flatId: string; roundId: string; round: { title: string; vendorId: string | null }; partsRequests: { id: string; status: string }[] };

/** The flat's confirmed items in the round, with what each resident actually paid for them. */
async function flatItems(tx: Tx, roundId: string, flatId: string) {
  const items = await tx.orderItem.findMany({
    where: { roundId, flatId, status: "CONFIRMED", quantity: { gt: 0 } },
    select: { id: true, userId: true, quantity: true, finalPaise: true, absorbedPaise: true, issueRefundPaise: true, offering: { select: { finalVendorPricePaise: true, gstBps: true } } },
  });
  return items.map((i) => ({
    ...i,
    paidPaise: Math.max(0, (i.finalPaise ?? 0) - (i.absorbedPaise ?? 0) - i.issueRefundPaise),
    // What the vendor is paid for the job: its price plus GST, as on the vendor order.
    vendorValuePaise: (() => {
      const taxable = i.quantity * (i.offering.finalVendorPricePaise ?? 0);
      return taxable + applyBps(taxable, i.offering.gstBps);
    })(),
  }));
}

async function vendorOrderId(tx: Tx, roundId: string, vendorId: string | null): Promise<string | null> {
  if (!vendorId) return null;
  return (await tx.vendorOrder.findUnique({ where: { roundId_vendorId: { roundId, vendorId } }, select: { id: true } }))?.id ?? null;
}

/** Couldn't get in: back what each resident paid, minus the visit fee once; the vendor keeps the fee instead of the job. */
async function noAccessRefunds(tx: Tx, visit: MovedVisit, feePaise: number, now: Date): Promise<{ refundedPaise: number; feeKeptPaise: number }> {
  const items = visit.kind === "STANDARD" ? await flatItems(tx, visit.roundId, visit.flatId) : [];
  const refunds = allocateNoAccessRefunds(
    items.map((i) => ({ orderItemId: i.id, userId: i.userId, paidPaise: i.paidPaise })),
    feePaise,
  ).filter((r) => r.refundPaise > 0);
  await tx.walletTransaction.createMany({
    data: refunds.map((r) => ({
      userId: r.userId,
      amountPaise: r.refundPaise,
      type: "NO_ACCESS_REFUND" as const,
      roundId: visit.roundId,
      orderItemId: r.orderItemId,
      idempotencyKey: noAccessRefundKey(visit.id, r.orderItemId),
      createdAt: now,
    })),
    skipDuplicates: true,
  });
  const { feeKeptPaise } = noAccessRefund(
    items.reduce((s, i) => s + i.paidPaise, 0),
    feePaise,
  );
  const orderId = await vendorOrderId(tx, visit.roundId, visit.round.vendorId);
  if (orderId && items.length > 0) {
    const amountPaise = noAccessVendorAdjustment(
      items.reduce((s, i) => s + i.vendorValuePaise, 0),
      feeKeptPaise,
    );
    await tx.vendorAdjustment.upsert({
      where: { visitId_type: { visitId: visit.id, type: "NO_ACCESS_FEE" } },
      create: { vendorOrderId: orderId, visitId: visit.id, type: "NO_ACCESS_FEE", amountPaise, note: "Technician couldn't get in", createdAt: now },
      update: {},
    });
  }
  return { refundedPaise: refunds.reduce((s, r) => s + r.refundPaise, 0), feeKeptPaise };
}

/**
 * Cancelled: everything paid for the visit comes back (a free revisit had nothing to pay), parts
 * included, and anything still waiting for approval is called off. The vendor isn't paid for the job.
 */
async function cancelRefunds(tx: Tx, visit: MovedVisit, now: Date): Promise<void> {
  const items = visit.kind === "STANDARD" ? await flatItems(tx, visit.roundId, visit.flatId) : [];
  const refunds = items.filter((i) => i.paidPaise > 0);
  await tx.walletTransaction.createMany({
    data: refunds.map((i) => ({
      userId: i.userId,
      amountPaise: i.paidPaise,
      type: "VISIT_CANCEL_REFUND" as const,
      roundId: visit.roundId,
      orderItemId: i.id,
      idempotencyKey: visitCancelRefundKey(visit.id, i.id),
      createdAt: now,
    })),
    skipDuplicates: true,
  });
  const byUser = new Map<string, number>();
  for (const r of refunds) byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + r.paidPaise);
  for (const [userId, amountPaise] of byUser) {
    await notify(
      tx,
      [userId],
      { type: "REFUND_CREDITED", params: { amountPaise, reason: "VISIT_CANCEL_REFUND", round: visit.round.title }, href: "/app/wallet" },
      { dedupeKey: notificationKeys.refund(`VISIT_CANCEL_REFUND:${visit.id}:${userId}`), now },
    );
  }

  const orderId = await vendorOrderId(tx, visit.roundId, visit.round.vendorId);
  if (orderId && items.length > 0) {
    await tx.vendorAdjustment.upsert({
      where: { visitId_type: { visitId: visit.id, type: "VISIT_CANCELLED" } },
      create: { vendorOrderId: orderId, visitId: visit.id, type: "VISIT_CANCELLED", amountPaise: -items.reduce((s, i) => s + i.vendorValuePaise, 0), note: "Visit cancelled", createdAt: now },
      update: {},
    });
  }

  for (const request of visit.partsRequests) {
    if (request.status === "APPROVED") await refundParts(tx, request.id, now);
    if (request.status === "PENDING") await tx.partsRequest.update({ where: { id: request.id }, data: { status: "DECLINED", pendingVisitId: null, decidedAt: now } });
  }
}

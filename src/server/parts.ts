import "server-only";
import type { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { QUOTE_TTL_MS, isQuoteExpired } from "@/lib/pricing/rules";
import { checkParts, partsDebitKey, partsRefundKey, type PartsError } from "@/lib/services/parts";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notifications";
import { paymentGateway } from "./payments/gateway";
import { lockRound } from "./round-lock";
import { lockUser, walletBalance } from "./wallet";

// Parts during a repair visit. The technician asks; someone in the flat approves (which pays for
// them: wallet first, the rest through the payment gateway) or declines. Every change takes the
// round lock, and paying also the resident's wallet lock, in the same order as checkout.

type Tx = Prisma.TransactionClient;

export type RequestPartsError = PartsError | "NOT_FOUND" | "NOT_IN_PROGRESS" | "ALREADY_WAITING";
export type DecideError = "NOT_FOUND" | "ALREADY_DECIDED" | "VISIT_NOT_IN_PROGRESS";
export type ApproveResult =
  | { status: "PAID" }
  | { status: "AWAITING_PAYMENT"; paymentId: string; roundId: string; provider: "MOCK" | "RAZORPAY"; providerOrderId: string; gatewayPaise: number }
  | { status: "REJECTED"; error: DecideError };

/** Everyone living in the flat: they share the visit. */
async function household(tx: Tx, flatId: string): Promise<string[]> {
  const users = await tx.user.findMany({ where: { flatId, role: "RESIDENT" }, select: { id: true } });
  return users.map((u) => u.id);
}

async function roundIdOfVisit(visitId: string): Promise<string | null> {
  return (await prisma.serviceVisit.findUnique({ where: { id: visitId }, select: { roundId: true } }))?.roundId ?? null;
}

async function roundIdOfRequest(requestId: string): Promise<string | null> {
  return (await prisma.partsRequest.findUnique({ where: { id: requestId }, select: { roundId: true } }))?.roundId ?? null;
}

/** The technician on the job lists the parts it needs. Only while working, one request at a time. */
export async function requestParts(
  technician: { id: string; role: Role; name: string | null },
  visitId: string,
  rawItems: readonly { name: unknown; qty: unknown; unitPaise: unknown }[],
  now: Date,
): Promise<{ ok: true; requestId: string } | { ok: false; error: RequestPartsError }> {
  const checked = checkParts(rawItems);
  if (!checked.ok) return checked;
  const roundId = technician.role === "TECHNICIAN" ? await roundIdOfVisit(visitId) : null;
  if (!roundId) return { ok: false, error: "NOT_FOUND" };
  try {
    return await prisma.$transaction(async (tx) => {
      await lockRound(tx, roundId);
      const visit = await tx.serviceVisit.findFirst({
        where: { id: visitId, technicianId: technician.id },
        select: { status: true, flatId: true, technicianName: true, round: { select: { title: true, service: { select: { name: true } } } }, partsRequests: { where: { status: "PENDING" }, select: { id: true } } },
      });
      if (!visit) return { ok: false, error: "NOT_FOUND" } as const;
      if (visit.status !== "IN_PROGRESS") return { ok: false, error: "NOT_IN_PROGRESS" } as const;
      if (visit.partsRequests.length > 0) return { ok: false, error: "ALREADY_WAITING" } as const;
      const request = await tx.partsRequest.create({
        data: {
          visitId,
          roundId,
          flatId: visit.flatId,
          items: checked.items as unknown as Prisma.InputJsonValue,
          totalPaise: checked.totalPaise,
          status: "PENDING",
          pendingVisitId: visitId,
          requestedById: technician.id,
          createdAt: now,
        },
        select: { id: true },
      });
      await notify(
        tx,
        await household(tx, visit.flatId),
        {
          type: "PARTS_APPROVAL",
          params: { service: visit.round.service?.name ?? visit.round.title, technician: technician.name ?? visit.technicianName ?? "", totalPaise: checked.totalPaise },
          href: `/app/orders/${roundId}`,
        },
        { dedupeKey: notificationKeys.partsApproval(request.id), now },
      );
      return { ok: true, requestId: request.id } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error, "pendingVisitId")) return { ok: false, error: "ALREADY_WAITING" };
    throw error;
  }
}

type Resident = { id: string; role: Role; flatId: string | null };

/** The waiting request, if it is this resident's flat's and the job is still going on. */
async function decidable(db: Tx | typeof prisma, resident: Resident, requestId: string): Promise<{ ok: true; request: { id: string; roundId: string; visitId: string; totalPaise: number } } | { ok: false; error: DecideError }> {
  if (resident.role !== "RESIDENT" || !resident.flatId) return { ok: false, error: "NOT_FOUND" };
  const request = await db.partsRequest.findFirst({
    where: { id: requestId, flatId: resident.flatId },
    select: { id: true, roundId: true, visitId: true, totalPaise: true, status: true, visit: { select: { status: true } } },
  });
  if (!request) return { ok: false, error: "NOT_FOUND" };
  if (request.status !== "PENDING") return { ok: false, error: "ALREADY_DECIDED" };
  if (request.visit.status !== "IN_PROGRESS") return { ok: false, error: "VISIT_NOT_IN_PROGRESS" };
  return { ok: true, request };
}

/**
 * Approving pays for the parts. If the wallet covers them it's done at once; otherwise a payment
 * for the rest is created (valid 15 minutes) and confirmed when the money arrives.
 */
export async function approveParts(resident: Resident, requestId: string, now: Date): Promise<ApproveResult> {
  const preview = await decidable(prisma, resident, requestId);
  if (!preview.ok) return { status: "REJECTED", error: preview.error };
  const { request } = preview;
  const balance = await walletBalance(prisma, resident.id);

  if (balance >= request.totalPaise) {
    return prisma.$transaction(async (tx): Promise<ApproveResult> => {
      await lockRound(tx, request.roundId);
      await lockUser(tx, resident.id);
      const again = await decidable(tx, resident, requestId);
      if (!again.ok) return { status: "REJECTED", error: again.error };
      if ((await walletBalance(tx, resident.id)) < request.totalPaise) return { status: "REJECTED", error: "ALREADY_DECIDED" };
      const payment = await tx.payment.create({ data: partsPaymentData(resident.id, request, request.totalPaise, "WALLET", now), select: { id: true } });
      await applyPartsPayment(tx, { paymentId: payment.id, userId: resident.id, walletAppliedPaise: request.totalPaise, providerPaymentId: null }, request.id, now);
      return { status: "PAID" };
    });
  }

  const gateway = paymentGateway();
  const walletApplied = Math.max(0, balance);
  const payment = await prisma.payment.create({ data: partsPaymentData(resident.id, request, walletApplied, gateway.provider, now) });
  const { providerOrderId } = await gateway.createOrder({ paymentId: payment.id, amountPaise: payment.gatewayPaise });
  await prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId } });
  return { status: "AWAITING_PAYMENT", paymentId: payment.id, roundId: request.roundId, provider: gateway.provider, providerOrderId, gatewayPaise: payment.gatewayPaise };
}

function partsPaymentData(
  userId: string,
  request: { id: string; roundId: string; totalPaise: number },
  walletAppliedPaise: number,
  provider: "WALLET" | "MOCK" | "RAZORPAY",
  now: Date,
): Prisma.PaymentUncheckedCreateInput {
  const wallet = provider === "WALLET";
  return {
    userId,
    roundId: request.roundId,
    purpose: "PARTS",
    partsRequestId: request.id,
    changes: { partsRequestId: request.id },
    chargePaise: request.totalPaise,
    creditPaise: 0,
    walletAppliedPaise,
    gatewayPaise: request.totalPaise - walletAppliedPaise,
    provider,
    status: wallet ? "PAID" : "CREATED",
    paidAt: wallet ? now : null,
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
    createdAt: now,
  };
}

/**
 * Why a captured parts payment can't be applied, or null if it can. Called by confirmPayment
 * under the round and wallet locks; a failure sends the money to the wallet instead.
 */
export async function partsPaymentProblem(
  tx: Tx,
  payment: { status: string; expiresAt: Date; partsRequestId: string | null; userId: string; walletAppliedPaise: number },
  now: Date,
): Promise<"EXPIRED" | "PARTS_DECIDED" | "VISIT_CHANGED" | "WALLET_CHANGED" | null> {
  if (payment.status !== "CREATED" || isQuoteExpired(payment.expiresAt, now)) return "EXPIRED";
  const request = payment.partsRequestId
    ? await tx.partsRequest.findUnique({ where: { id: payment.partsRequestId }, select: { status: true, visit: { select: { status: true } } } })
    : null;
  if (!request || request.status !== "PENDING") return "PARTS_DECIDED";
  if (request.visit.status !== "IN_PROGRESS") return "VISIT_CHANGED";
  if ((await walletBalance(tx, payment.userId)) < payment.walletAppliedPaise) return "WALLET_CHANGED";
  return null;
}

/**
 * Pays for a waiting request: the wallet's share leaves the wallet, the request is approved, and
 * the vendor's payout grows by the parts. Callers hold the round and wallet locks.
 */
export async function applyPartsPayment(
  tx: Tx,
  payment: { paymentId: string; userId: string; walletAppliedPaise: number; providerPaymentId: string | null },
  requestId: string,
  now: Date,
): Promise<void> {
  const request = await tx.partsRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { visitId: true, roundId: true, totalPaise: true, round: { select: { vendorId: true } } },
  });
  if (payment.walletAppliedPaise > 0) {
    await tx.walletTransaction.create({
      data: {
        userId: payment.userId,
        amountPaise: -payment.walletAppliedPaise,
        type: "PARTS_DEBIT",
        roundId: request.roundId,
        paymentId: payment.paymentId,
        idempotencyKey: partsDebitKey(payment.paymentId),
        createdAt: now,
      },
    });
  }
  await tx.payment.update({ where: { id: payment.paymentId }, data: { status: "PAID", paidAt: now, providerPaymentId: payment.providerPaymentId } });
  const { count } = await tx.partsRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "APPROVED", pendingVisitId: null, decidedById: payment.userId, decidedAt: now },
  });
  if (count !== 1) throw new Error(`Parts request ${requestId} was no longer waiting`);
  await adjustVendorForParts(tx, request.visitId, request.roundId, request.round.vendorId, request.totalPaise, now);
}

/** The vendor is paid the parts at cost: one PARTS adjustment per visit, moved by each approval and refund. */
async function adjustVendorForParts(tx: Tx, visitId: string, roundId: string, vendorId: string | null, deltaPaise: number, now: Date) {
  if (!vendorId) return;
  const order = await tx.vendorOrder.findUnique({ where: { roundId_vendorId: { roundId, vendorId } }, select: { id: true } });
  if (!order) return;
  await tx.vendorAdjustment.upsert({
    where: { visitId_type: { visitId, type: "PARTS" } },
    create: { vendorOrderId: order.id, visitId, type: "PARTS", amountPaise: deltaPaise, note: "Parts at cost, paid by the resident", createdAt: now },
    update: { amountPaise: { increment: deltaPaise } },
  });
}

/** The resident says no: the technician carries on without the parts. */
export async function declineParts(resident: Resident, requestId: string, now: Date): Promise<{ ok: true } | { ok: false; error: DecideError }> {
  const roundId = await roundIdOfRequest(requestId);
  if (!roundId) return { ok: false, error: "NOT_FOUND" };
  return prisma.$transaction(async (tx) => {
    await lockRound(tx, roundId);
    const check = await decidable(tx, resident, requestId);
    if (!check.ok && check.error !== "VISIT_NOT_IN_PROGRESS") return check;
    await tx.partsRequest.update({ where: { id: requestId }, data: { status: "DECLINED", pendingVisitId: null, decidedById: resident.id, decidedAt: now } });
    return { ok: true } as const;
  });
}

/**
 * Parts paid for go back to whoever paid: not used, or the visit was cancelled. The vendor's
 * payout shrinks by the same amount. Callers hold the round lock.
 */
export async function refundParts(tx: Tx, requestId: string, now: Date): Promise<number> {
  const request = await tx.partsRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { id: true, status: true, visitId: true, roundId: true, totalPaise: true, round: { select: { title: true, vendorId: true } }, payments: { where: { status: "PAID" }, select: { userId: true } } },
  });
  if (request.status !== "APPROVED") return 0;
  const payer = request.payments[0]?.userId;
  if (!payer) throw new Error(`Approved parts request ${requestId} has no paid payment`);
  await tx.partsRequest.update({ where: { id: requestId }, data: { status: "REFUNDED", refundedAt: now } });
  await tx.walletTransaction.create({
    data: { userId: payer, amountPaise: request.totalPaise, type: "PARTS_REFUND", roundId: request.roundId, idempotencyKey: partsRefundKey(request.id), createdAt: now },
  });
  await adjustVendorForParts(tx, request.visitId, request.roundId, request.round.vendorId, -request.totalPaise, now);
  await notify(
    tx,
    [payer],
    { type: "REFUND_CREDITED", params: { amountPaise: request.totalPaise, reason: "PARTS_REFUND", round: request.round.title }, href: "/app/wallet" },
    { dedupeKey: notificationKeys.refund(partsRefundKey(request.id)), now },
  );
  return request.totalPaise;
}

/** The technician didn't need parts the resident paid for: they go back to the wallet. Only while working. */
export async function returnUnusedParts(technician: { id: string; role: Role }, requestId: string, now: Date): Promise<{ ok: true } | { ok: false; error: "NOT_FOUND" | "NOT_REFUNDABLE" }> {
  const roundId = technician.role === "TECHNICIAN" ? await roundIdOfRequest(requestId) : null;
  if (!roundId) return { ok: false, error: "NOT_FOUND" };
  return prisma.$transaction(async (tx) => {
    await lockRound(tx, roundId);
    const request = await tx.partsRequest.findFirst({ where: { id: requestId, visit: { technicianId: technician.id } }, select: { status: true, visit: { select: { status: true } } } });
    if (!request) return { ok: false, error: "NOT_FOUND" } as const;
    if (request.status !== "APPROVED" || request.visit.status !== "IN_PROGRESS") return { ok: false, error: "NOT_REFUNDABLE" } as const;
    await refundParts(tx, requestId, now);
    return { ok: true } as const;
  });
}

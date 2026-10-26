import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { canManageCommunity } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { checkRevisitTime } from "@/lib/manager-rules";
import { notificationKeys } from "@/lib/notifications";
import { applyBps } from "@/lib/pricing/money";
import { noAccessFeeRefundKey, resolutionOptions, serviceIssueRefundKey, type Resolution } from "@/lib/services/issues";
import { noAccessRefundKey } from "@/lib/services/no-access";
import { formatCompletionCode } from "@/lib/services/visit";
import { notify } from "./notifications";
import { lockRound } from "./round-lock";
import type { Actor } from "./rounds";

// Complaints about service visits, as the Society Manager sees them. A job not done properly gets
// ONE free revisit or a refund of what was paid, never both; a disputed no-access fee is given back
// or the complaint closed with a reason. Every decision tells the household.

type Tx = Prisma.TransactionClient;

export async function listCommunityIssues(communityId: string) {
  const issues = await prisma.serviceIssue.findMany({
    where: { round: { communityId } },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      kind: true,
      status: true,
      note: true,
      resolution: true,
      createdAt: true,
      resolvedAt: true,
      reportedBy: { select: { name: true } },
      flat: { select: { tower: true, number: true } },
      round: { select: { id: true, title: true, service: { select: { name: true } } } },
      visit: {
        select: {
          kind: true,
          status: true,
          startsAt: true,
          technicianName: true,
          revisit: { select: { status: true, startsAt: true } },
        },
      },
    },
  });
  const order = (s: string) => (s === "OPEN" ? 0 : s === "REVISIT_SCHEDULED" ? 1 : 2);
  return issues
    .map((i) => ({ ...i, options: resolutionOptions({ issue: i, visit: i.visit, hasRevisit: i.visit.revisit !== null }) }))
    .sort((a, b) => order(a.status) - order(b.status));
}

export type CommunityIssue = Awaited<ReturnType<typeof listCommunityIssues>>[number];
export type ResolveError = "NOT_FOUND" | "NOT_ALLOWED" | "TOO_SOON" | "TOO_FAR" | "NOTE_REQUIRED";

async function household(tx: Tx, flatId: string): Promise<string[]> {
  return (await tx.user.findMany({ where: { flatId, role: "RESIDENT" }, select: { id: true } })).map((u) => u.id);
}

export async function resolveServiceIssue(
  actor: Actor,
  issueId: string,
  input: { resolution: Resolution; revisitAt?: Date | null; note?: string },
  now: Date,
): Promise<{ ok: true; refundedPaise: number } | { ok: false; error: ResolveError }> {
  const found = await prisma.serviceIssue.findUnique({ where: { id: issueId }, select: { roundId: true } });
  if (!found) return { ok: false, error: "NOT_FOUND" };
  return prisma.$transaction(async (tx) => {
    await lockRound(tx, found.roundId);
    const issue = await tx.serviceIssue.findUniqueOrThrow({
      where: { id: issueId },
      select: {
        id: true,
        kind: true,
        status: true,
        flatId: true,
        roundId: true,
        round: { select: { title: true, communityId: true, vendorId: true, service: { select: { name: true, durationMinutes: true } } } },
        visit: { select: { id: true, kind: true, bookingId: true, technicianId: true, technicianName: true, revisit: { select: { id: true } } } },
      },
    });
    if (!canManageCommunity(actor, issue.round.communityId)) return { ok: false, error: "NOT_FOUND" } as const;
    const allowed = resolutionOptions({ issue, visit: issue.visit, hasRevisit: issue.visit.revisit !== null });
    if (!allowed.includes(input.resolution)) return { ok: false, error: "NOT_ALLOWED" } as const;
    const note = input.note?.trim().slice(0, 300) ?? "";
    const service = issue.round.service?.name ?? issue.round.title;
    const residents = await household(tx, issue.flatId);
    let refundedPaise = 0;
    let status: "REVISIT_SCHEDULED" | "REFUNDED" | "REJECTED";

    if (input.resolution === "REVISIT") {
      const startsAt = input.revisitAt ?? new Date(NaN);
      const timing = checkRevisitTime(startsAt, now);
      if (timing) return { ok: false, error: timing } as const;
      const revisit = await tx.serviceVisit.create({
        data: {
          roundId: issue.roundId,
          bookingId: issue.visit.bookingId,
          flatId: issue.flatId,
          kind: "REVISIT",
          revisitOfId: issue.visit.id,
          status: "SCHEDULED",
          startsAt,
          endsAt: new Date(startsAt.getTime() + (issue.round.service?.durationMinutes ?? 60) * 60_000),
          technicianId: issue.visit.technicianId,
          technicianName: issue.visit.technicianName,
          completionCode: formatCompletionCode(randomInt(0, 10_000)),
          createdAt: now,
        },
      });
      await notify(
        tx,
        residents,
        { type: "VISIT_SCHEDULED", params: { service: `${service} (revisit)`, startsAt: startsAt.toISOString(), code: revisit.completionCode }, href: `/app/orders/${issue.roundId}` },
        { dedupeKey: notificationKeys.visit(revisit.id, "SCHEDULED"), now },
      );
      status = "REVISIT_SCHEDULED";
    } else if (input.resolution === "REFUND") {
      refundedPaise = issue.kind === "NO_ACCESS_DISPUTE" ? await refundVisitFee(tx, issue, actor, now) : await refundVisit(tx, issue, actor, now);
      status = "REFUNDED";
    } else {
      if (note.length < 3) return { ok: false, error: "NOTE_REQUIRED" } as const;
      status = "REJECTED";
    }

    await tx.serviceIssue.update({
      where: { id: issueId },
      data: { status, resolution: note || null, resolvedById: actor.id, resolvedAt: status === "REVISIT_SCHEDULED" ? null : now },
    });
    await notify(tx, residents, { type: "ISSUE_UPDATE", params: { service, status }, href: `/app/orders/${issue.roundId}` }, { dedupeKey: notificationKeys.issue(issueId, status), now });
    return { ok: true, refundedPaise } as const;
  });
}

type LoadedIssue = { id: string; flatId: string; roundId: string; round: { title: string; vendorId: string | null }; visit: { id: string } };

/** What each resident in the flat actually paid for the job, still unrefunded. */
async function paidItems(tx: Tx, roundId: string, flatId: string) {
  const items = await tx.orderItem.findMany({
    where: { roundId, flatId, status: "CONFIRMED", quantity: { gt: 0 } },
    select: { id: true, userId: true, quantity: true, finalPaise: true, absorbedPaise: true, issueRefundPaise: true, offering: { select: { finalVendorPricePaise: true, gstBps: true } } },
  });
  return items.map((i) => {
    const taxable = i.quantity * (i.offering.finalVendorPricePaise ?? 0);
    return { ...i, paidPaise: Math.max(0, (i.finalPaise ?? 0) - (i.absorbedPaise ?? 0) - i.issueRefundPaise), vendorValuePaise: taxable + applyBps(taxable, i.offering.gstBps) };
  });
}

async function vendorOrderId(tx: Tx, roundId: string, vendorId: string | null) {
  if (!vendorId) return null;
  return (await tx.vendorOrder.findUnique({ where: { roundId_vendorId: { roundId, vendorId } }, select: { id: true } }))?.id ?? null;
}

/** Job not done properly: back what was paid for it; the vendor isn't paid for the job. */
async function refundVisit(tx: Tx, issue: LoadedIssue, actor: Actor, now: Date): Promise<number> {
  const items = (await paidItems(tx, issue.roundId, issue.flatId)).filter((i) => i.paidPaise > 0);
  for (const item of items) {
    await tx.walletTransaction.create({
      data: { userId: item.userId, amountPaise: item.paidPaise, type: "SERVICE_ISSUE_REFUND", roundId: issue.roundId, orderItemId: item.id, idempotencyKey: serviceIssueRefundKey(item.id, item.quantity), createdAt: now },
    });
    await tx.orderItem.update({ where: { id: item.id }, data: { issueRefundPaise: { increment: item.paidPaise } } });
    await tx.orderIssue.create({
      data: { roundId: issue.roundId, flatId: issue.flatId, orderItemId: item.id, serviceIssueId: issue.id, reason: "SERVICE_NOT_DONE", quantity: item.quantity, refundPaise: item.paidPaise, createdById: actor.id, createdAt: now },
    });
  }
  const orderId = await vendorOrderId(tx, issue.roundId, issue.round.vendorId);
  if (orderId && items.length > 0) {
    await tx.vendorAdjustment.create({
      data: { vendorOrderId: orderId, visitId: issue.visit.id, type: "ISSUE_REFUND", amountPaise: -items.reduce((s, i) => s + i.vendorValuePaise, 0), note: "Job not done properly: refunded", createdAt: now },
    });
  }
  await creditNotices(tx, issue, items.map((i) => ({ userId: i.userId, amountPaise: i.paidPaise })), now);
  return items.reduce((s, i) => s + i.paidPaise, 0);
}

/** A disputed no-access visit: the visit fee that was kept goes back; the vendor no longer keeps it. */
async function refundVisitFee(tx: Tx, issue: LoadedIssue, actor: Actor, now: Date): Promise<number> {
  const items = await paidItems(tx, issue.roundId, issue.flatId);
  const credits: { userId: string; amountPaise: number; orderItemId: string }[] = [];
  for (const item of items) {
    const refunded = await tx.walletTransaction.findUnique({ where: { idempotencyKey: noAccessRefundKey(issue.visit.id, item.id) }, select: { amountPaise: true } });
    const feeKept = item.paidPaise - (refunded?.amountPaise ?? 0);
    if (feeKept > 0) credits.push({ userId: item.userId, amountPaise: feeKept, orderItemId: item.id });
  }
  for (const c of credits) {
    await tx.walletTransaction.create({
      data: { userId: c.userId, amountPaise: c.amountPaise, type: "SERVICE_ISSUE_REFUND", roundId: issue.roundId, orderItemId: c.orderItemId, idempotencyKey: noAccessFeeRefundKey(issue.id, c.orderItemId), createdAt: now },
    });
    await tx.orderIssue.create({
      data: { roundId: issue.roundId, flatId: issue.flatId, orderItemId: c.orderItemId, serviceIssueId: issue.id, reason: "SERVICE_NOT_DONE", quantity: 0, refundPaise: c.amountPaise, note: "Visit fee returned", createdById: actor.id, createdAt: now },
    });
  }
  const total = credits.reduce((s, c) => s + c.amountPaise, 0);
  const orderId = await vendorOrderId(tx, issue.roundId, issue.round.vendorId);
  if (orderId && total > 0) {
    await tx.vendorAdjustment.create({ data: { vendorOrderId: orderId, visitId: issue.visit.id, type: "ISSUE_REFUND", amountPaise: -total, note: "No-access fee returned after a dispute", createdAt: now } });
  }
  await creditNotices(tx, issue, credits, now);
  return total;
}

async function creditNotices(tx: Tx, issue: LoadedIssue, credits: { userId: string; amountPaise: number }[], now: Date) {
  const byUser = new Map<string, number>();
  for (const c of credits) byUser.set(c.userId, (byUser.get(c.userId) ?? 0) + c.amountPaise);
  for (const [userId, amountPaise] of byUser) {
    await notify(
      tx,
      [userId],
      { type: "REFUND_CREDITED", params: { amountPaise, reason: "SERVICE_ISSUE_REFUND", round: issue.round.title }, href: "/app/wallet" },
      { dedupeKey: notificationKeys.refund(`SERVICE_ISSUE_REFUND:${issue.id}:${userId}`), now },
    );
  }
}

/** A free revisit was done: the complaint it answered is resolved. Called when a revisit completes. */
export async function resolveByRevisit(tx: Tx, revisitOfId: string, now: Date): Promise<void> {
  const issue = await tx.serviceIssue.findFirst({
    where: { visitId: revisitOfId, status: "REVISIT_SCHEDULED" },
    select: { id: true, flatId: true, roundId: true, round: { select: { title: true, service: { select: { name: true } } } } },
  });
  if (!issue) return;
  await tx.serviceIssue.update({ where: { id: issue.id }, data: { status: "RESOLVED", resolvedAt: now } });
  await notify(
    tx,
    await household(tx, issue.flatId),
    { type: "ISSUE_UPDATE", params: { service: issue.round.service?.name ?? issue.round.title, status: "RESOLVED" }, href: `/app/orders/${issue.roundId}` },
    { dedupeKey: notificationKeys.issue(issue.id, "RESOLVED"), now },
  );
}

import "server-only";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { checkReport } from "@/lib/services/issues";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notifications";
import { communityManagerIds } from "./rounds";

// A resident's say on a service visit to their flat: a 1–5 rating once it's done, and a complaint
// within 48 hours (job not done properly, or a no-access fee they dispute). Anyone living in the
// flat may do either, once per visit.

export type Resident = { id: string; role: Role; flatId: string | null };

export const MAX_COMMENT = 300;
export const MIN_NOTE = 10;
export const MAX_NOTE = 500;

export type RatingError = "NOT_FOUND" | "NOT_COMPLETED" | "ALREADY_RATED" | "INVALID_RATING" | "COMMENT_TOO_LONG";
export type ReportError = "NOT_FOUND" | "NOT_REPORTABLE" | "WINDOW_CLOSED" | "ALREADY_REPORTED" | "INVALID_NOTE";

/** The visit, if it was to this resident's flat. */
function residentsVisit(user: Resident, visitId: string) {
  if (user.role !== "RESIDENT" || !user.flatId) return null;
  return prisma.serviceVisit.findFirst({
    where: { id: visitId, flatId: user.flatId },
    select: {
      id: true,
      status: true,
      completedAt: true,
      noAccessAt: true,
      roundId: true,
      flatId: true,
      issue: { select: { id: true } },
      round: { select: { title: true, communityId: true, vendorId: true, service: { select: { name: true, vendorId: true } } } },
      flat: { select: { tower: true, number: true, community: { select: { unitLabel: true } } } },
    },
  });
}

export async function rateVisit(user: Resident, input: { visitId: string; rating: number; comment: string }, now: Date): Promise<{ ok: true } | { ok: false; error: RatingError }> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return { ok: false, error: "INVALID_RATING" };
  const comment = input.comment.trim();
  if (comment.length > MAX_COMMENT) return { ok: false, error: "COMMENT_TOO_LONG" };
  const visit = await residentsVisit(user, input.visitId);
  if (!visit) return { ok: false, error: "NOT_FOUND" };
  if (visit.status !== "COMPLETED") return { ok: false, error: "NOT_COMPLETED" };
  const vendorId = visit.round.vendorId ?? visit.round.service?.vendorId;
  if (!vendorId) return { ok: false, error: "NOT_FOUND" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.visitRating.create({ data: { visitId: visit.id, userId: user.id, vendorId, rating: input.rating, comment: comment || null, createdAt: now } });
      // The vendor's average, kept alongside so listings don't add up every rating.
      await tx.vendor.update({ where: { id: vendorId }, data: { ratingSum: { increment: input.rating }, ratingCount: { increment: 1 } } });
    });
  } catch (error) {
    if (isUniqueViolation(error, "visitId")) return { ok: false, error: "ALREADY_RATED" };
    throw error;
  }
  return { ok: true };
}

export async function reportVisitIssue(user: Resident, input: { visitId: string; note: string }, now: Date): Promise<{ ok: true; issueId: string } | { ok: false; error: ReportError }> {
  const note = input.note.trim();
  if (note.length < MIN_NOTE || note.length > MAX_NOTE) return { ok: false, error: "INVALID_NOTE" };
  const visit = await residentsVisit(user, input.visitId);
  if (!visit) return { ok: false, error: "NOT_FOUND" };
  const check = checkReport({ visit, hasIssue: visit.issue !== null, now });
  if (!check.ok) return { ok: false, error: check.error };

  const service = visit.round.service?.name ?? visit.round.title;
  const flat = `${visit.flat.community.unitLabel} ${visit.flat.tower}-${visit.flat.number}`;
  try {
    const issueId = await prisma.$transaction(async (tx) => {
      const issue = await tx.serviceIssue.create({
        data: { visitId: visit.id, roundId: visit.roundId, flatId: visit.flatId, kind: check.kind, reportedById: user.id, note, status: "OPEN", createdAt: now },
        select: { id: true },
      });
      await notify(
        tx,
        await communityManagerIds(tx, visit.round.communityId),
        { type: "ISSUE_REPORTED", params: { service, flat, kind: check.kind }, href: `/manager/rounds/${visit.roundId}` },
        { dedupeKey: notificationKeys.issueReported(issue.id), now },
      );
      // Everyone in the flat shares the visit, so everyone gets the receipt.
      const household = await tx.user.findMany({ where: { flatId: visit.flatId }, select: { id: true } });
      await notify(
        tx,
        household.map((u) => u.id),
        { type: "ISSUE_UPDATE", params: { service, status: "OPEN" }, href: `/app/orders/${visit.roundId}` },
        { dedupeKey: notificationKeys.issue(issue.id, "OPEN"), now },
      );
      return issue.id;
    });
    return { ok: true, issueId };
  } catch (error) {
    if (isUniqueViolation(error, "visitId")) return { ok: false, error: "ALREADY_REPORTED" };
    throw error;
  }
}

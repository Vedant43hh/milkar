import "server-only";
import { canManageCommunity } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { isCodeLocked } from "@/lib/services/visit";
import { startOfIstDay } from "@/lib/time";
import type { Actor } from "./rounds";

// Visit days, as the Society Manager runs them: every confirmed Service Day with its visits, and a
// live board per slot showing where each technician has got to.

/** Service Days with visits: coming up first, then the latest done. */
export async function listVisitDays(communityId: string, now: Date) {
  const rounds = await prisma.orderRound.findMany({
    where: { communityId, kind: "SERVICE", status: { in: ["FINALIZED", "COMPLETED"] }, visits: { some: {} } },
    select: {
      id: true,
      title: true,
      status: true,
      service: { select: { name: true } },
      visits: { select: { status: true, startsAt: true } },
    },
  });
  const today = startOfIstDay(now).getTime();
  return rounds
    .map((r) => {
      const days = [...new Set(r.visits.map((v) => startOfIstDay(v.startsAt).getTime()))].sort((a, b) => a - b);
      const open = r.visits.filter((v) => v.status === "SCHEDULED" || v.status === "ON_THE_WAY" || v.status === "IN_PROGRESS").length;
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        service: r.service?.name ?? r.title,
        first: new Date(days[0]),
        last: new Date(days.at(-1)!),
        today: days.includes(today),
        visits: r.visits.length,
        done: r.visits.filter((v) => v.status === "COMPLETED").length,
        open,
      };
    })
    .sort((a, b) => Number(b.open > 0) - Number(a.open > 0) || (b.open > 0 ? a.first.getTime() - b.first.getTime() : b.last.getTime() - a.last.getTime()));
}

export type VisitDay = Awaited<ReturnType<typeof listVisitDays>>[number];

/** One Service Day's visits, slot by slot (free revisits on their own), or null if it isn't the actor's. */
export async function getVisitBoard(actor: Actor, roundId: string) {
  const round = await prisma.orderRound.findFirst({
    where: { id: roundId, kind: "SERVICE" },
    select: {
      id: true,
      title: true,
      status: true,
      communityId: true,
      community: { select: { unitLabel: true } },
      service: { select: { name: true } },
      slots: { orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, endsAt: true } },
      visits: {
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          slotId: true,
          kind: true,
          status: true,
          startsAt: true,
          endsAt: true,
          technicianName: true,
          codeAttempts: true,
          cancelReason: true,
          flat: { select: { tower: true, number: true } },
          booking: { select: { problemNote: true } },
          partsRequests: { where: { status: "PENDING" }, select: { id: true } },
          issue: { select: { status: true } },
        },
      },
    },
  });
  if (!round || !canManageCommunity(actor, round.communityId)) return null;
  const visits = round.visits.map((v) => ({ ...v, codeLocked: isCodeLocked(v), partsWaiting: v.partsRequests.length > 0 }));
  const counts = { total: visits.length, done: visits.filter((v) => v.status === "COMPLETED").length, problems: visits.filter((v) => v.status === "NO_ACCESS" || v.status === "CANCELLED").length };
  return {
    round: { id: round.id, title: round.title, status: round.status, service: round.service?.name ?? round.title, unitLabel: round.community.unitLabel },
    slots: round.slots.map((s) => ({ ...s, visits: visits.filter((v) => v.slotId === s.id) })).filter((s) => s.visits.length > 0),
    revisits: visits.filter((v) => v.slotId === null),
    counts,
  };
}

export type VisitBoard = NonNullable<Awaited<ReturnType<typeof getVisitBoard>>>;

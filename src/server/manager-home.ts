import "server-only";
import { prisma } from "@/lib/db";
import { savingsVsMrp } from "@/lib/savings";
import { startOfIstDay, startOfIstMonth } from "@/lib/time";

const DAY = 24 * 60 * 60 * 1000;

/**
 * The community at a glance for its Society Managers: who lives there and who's buying, what's
 * open, this month's sales and savings, what's waiting for them, and today's handouts and visits.
 */
export async function getManagerHome(communityId: string, now: Date) {
  const month = startOfIstMonth(now);
  const today = startOfIstDay(now);
  const tomorrow = startOfIstDay(now, 1);
  const [residents, flats, activeFlats, openRounds, monthItems, pendingJoins, openIssues, distributions, visitDays] = await Promise.all([
    prisma.user.count({ where: { role: "RESIDENT", flat: { communityId } } }),
    prisma.flat.count({ where: { communityId } }),
    prisma.orderItem.groupBy({
      by: ["flatId"],
      where: { quantity: { gt: 0 }, status: { in: ["ACTIVE", "CONFIRMED"] }, round: { communityId }, updatedAt: { gte: new Date(now.getTime() - 30 * DAY) } },
    }),
    prisma.orderRound.count({ where: { communityId, status: "OPEN", cutoffAt: { gt: now } } }),
    prisma.orderItem.findMany({
      where: { status: "CONFIRMED", quantity: { gt: 0 }, round: { communityId, finalizedAt: { gte: month } } },
      select: { quantity: true, finalPaise: true, offering: { select: { mrpPaise: true } } },
    }),
    prisma.joinRequest.count({ where: { communityId, status: "PENDING" } }),
    prisma.serviceIssue.count({ where: { round: { communityId }, status: "OPEN" } }),
    // Bags still to hand out: delivered (or due) and not every flat has collected.
    prisma.orderRound.findMany({
      where: { communityId, kind: "GROCERY", status: "FINALIZED", deliveryAt: { lt: tomorrow } },
      orderBy: { deliveryAt: "asc" },
      select: { id: true, title: true, deliveryAt: true, distributionRecords: { select: { status: true } } },
    }),
    prisma.orderRound.findMany({
      where: { communityId, kind: "SERVICE", visits: { some: { startsAt: { gte: today, lt: tomorrow } } } },
      select: { id: true, title: true, visits: { where: { startsAt: { gte: today, lt: tomorrow } }, select: { status: true } } },
    }),
  ]);
  return {
    residents,
    flats,
    activeFlats: activeFlats.length,
    openRounds,
    gmvPaise: monthItems.reduce((s, i) => s + (i.finalPaise ?? 0), 0),
    savedPaise: savingsVsMrp(monthItems.map((i) => ({ mrpPaise: i.offering.mrpPaise, quantity: i.quantity, finalPaise: i.finalPaise ?? 0 }))),
    pendingJoins,
    openIssues,
    distributions: distributions.map((d) => ({ id: d.id, title: d.title, deliveryAt: d.deliveryAt, collected: d.distributionRecords.filter((r) => r.status === "COLLECTED").length, total: d.distributionRecords.length })),
    visitDays: visitDays.map((v) => ({ id: v.id, title: v.title, visits: v.visits.length, done: v.visits.filter((x) => x.status === "COMPLETED").length })),
  };
}

export type ManagerHome = Awaited<ReturnType<typeof getManagerHome>>;

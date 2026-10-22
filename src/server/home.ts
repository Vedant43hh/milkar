import "server-only";
import { BUY_CATEGORIES, type BuyCategory } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { savingsVsMrp } from "@/lib/savings";
import { startOfIstMonth } from "@/lib/time";
import { openGroupBuys } from "./group-buys";
import { getCommunityImpact } from "./impact";
import { listResidentPolls } from "./polls";
import { walletBalance } from "./wallet";

/** Everything on a resident's home screen, in one go. */
export async function getResidentHome(user: { id: string; flatId: string; communityId: string }, now: Date) {
  const [openRounds, held, visits, polls, confirmed, walletPaise, impact] = await Promise.all([
    openGroupBuys(user, now),
    prisma.serviceBooking.findMany({
      where: { flatId: user.flatId, status: "HELD", holdExpiresAt: { gt: now }, round: { status: "OPEN" } },
      select: { roundId: true, holdExpiresAt: true, slot: { select: { startsAt: true } }, round: { select: { service: { select: { name: true } } } } },
    }),
    prisma.serviceVisit.findMany({
      where: { flatId: user.flatId, status: { in: ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS"] }, endsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { id: true, roundId: true, startsAt: true, technicianName: true, completionCode: true, status: true, kind: true, round: { select: { service: { select: { name: true } } } } },
    }),
    listResidentPolls(user.communityId, user.flatId),
    prisma.orderItem.findMany({
      where: { userId: user.id, status: "CONFIRMED", round: { finalizedAt: { gte: startOfIstMonth(now) } } },
      select: { quantity: true, finalPaise: true, offering: { select: { mrpPaise: true } } },
    }),
    walletBalance(prisma, user.id),
    getCommunityImpact(user.communityId),
  ]);

  const categoryCounts = Object.fromEntries(BUY_CATEGORIES.map((c) => [c, openRounds.filter((r) => r.category === c).length])) as Record<BuyCategory, number>;

  return {
    openRounds,
    categoryCounts,
    impact,
    held,
    visits,
    polls: polls
      .filter((p) => p.status === "OPEN")
      .sort((a, b) => b._count.votes / b.threshold - a._count.votes / a.threshold)
      .slice(0, 3),
    savingsPaise: savingsVsMrp(confirmed.map((i) => ({ mrpPaise: i.offering.mrpPaise, quantity: i.quantity, finalPaise: i.finalPaise ?? 0 }))),
    walletPaise,
  };
}

export type ResidentHome = Awaited<ReturnType<typeof getResidentHome>>;

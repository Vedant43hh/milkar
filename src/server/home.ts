import "server-only";
import { prisma } from "@/lib/db";
import { roundStats } from "@/lib/rounds";
import type { Tier } from "@/lib/pricing/tiers";
import { savingsVsMrp } from "@/lib/savings";
import { startOfIstMonth } from "@/lib/time";
import { listResidentPolls } from "./polls";
import { walletBalance } from "./wallet";

/** Everything on a resident's home screen, in one go. */
export async function getResidentHome(user: { id: string; flatId: string; communityId: string }, now: Date) {
  const [rounds, held, visits, polls, confirmed, walletPaise] = await Promise.all([
    prisma.orderRound.findMany({
      where: { communityId: user.communityId, status: "OPEN", cutoffAt: { gt: now } },
      orderBy: { cutoffAt: "asc" },
      include: {
        service: { select: { name: true } },
        offerings: {
          include: {
            product: { select: { name: true, unit: true } },
            serviceOption: { select: { name: true } },
            orderItems: { select: { userId: true, flatId: true, quantity: true, chargedPaise: true } },
          },
        },
        bookings: { where: { flatId: user.flatId, status: "ACTIVE" }, select: { status: true, slot: { select: { startsAt: true } } } },
      },
    }),
    prisma.serviceBooking.findMany({
      where: { flatId: user.flatId, status: "HELD", holdExpiresAt: { gt: now }, round: { status: "OPEN" } },
      select: { roundId: true, holdExpiresAt: true, slot: { select: { startsAt: true } }, round: { select: { service: { select: { name: true } } } } },
    }),
    prisma.serviceVisit.findMany({
      where: { flatId: user.flatId, status: { in: ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS"] }, endsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { id: true, startsAt: true, technicianName: true, completionCode: true, status: true, kind: true, round: { select: { service: { select: { name: true } } } } },
    }),
    listResidentPolls(user.communityId, user.flatId),
    prisma.orderItem.findMany({
      where: { userId: user.id, status: "CONFIRMED", round: { finalizedAt: { gte: startOfIstMonth(now) } } },
      select: { quantity: true, finalPaise: true, offering: { select: { mrpPaise: true } } },
    }),
    walletBalance(prisma, user.id),
  ]);

  const openRounds = rounds.map((round) => {
    const stats = roundStats(
      round.offerings.map((o) => ({
        id: o.id,
        tierGroupKey: o.tierGroupKey,
        pricing: { tierBasis: o.tierBasis, tiers: o.tiers as Tier[], marginBps: round.marginBps, gstBps: o.gstBps, minOrderQty: o.minOrderQty, mrpPaise: o.mrpPaise },
        items: o.orderItems,
      })),
    );
    const mine = round.offerings.flatMap((o) => o.orderItems).filter((i) => i.userId === user.id && i.quantity > 0);
    const lead = stats.closeToUnlock[0] ?? stats.belowMinimum[0] ?? null;
    const leadOffering = lead ? round.offerings.find((o) => o.id === lead.id) : null;
    return {
      id: round.id,
      kind: round.kind,
      title: round.title,
      cutoffAt: round.cutoffAt,
      serviceName: round.service?.name ?? null,
      lead:
        lead && leadOffering
          ? { meter: lead.meter, name: leadOffering.product?.name ?? leadOffering.serviceOption?.name ?? "", basis: leadOffering.tierBasis, productUnit: leadOffering.product?.unit ?? null }
          : null,
      myUnits: mine.reduce((n, i) => n + i.quantity, 0),
      myPaidPaise: mine.reduce((s, i) => s + i.chargedPaise, 0),
      booking: round.bookings[0] ?? null,
    };
  });

  return {
    openRounds,
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

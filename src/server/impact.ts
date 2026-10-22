import "server-only";
import { prisma } from "@/lib/db";
import { communityImpact, countTrips, DEFAULT_IMPACT_ASSUMPTIONS } from "@/lib/impact";
import { savingsVsMrp } from "@/lib/savings";
import { utcToIstDate } from "@/lib/time";

/**
 * What a community has saved by buying together since it joined, and the vendor trips that saved:
 * prices from every confirmed item, deliveries from delivered grocery rounds, and completed visits.
 */
export async function getCommunityImpact(communityId: string) {
  const [items, visits] = await Promise.all([
    prisma.orderItem.findMany({
      where: { status: "CONFIRMED", quantity: { gt: 0 }, round: { communityId } },
      select: { roundId: true, flatId: true, quantity: true, finalPaise: true, offering: { select: { mrpPaise: true, vendorId: true } }, round: { select: { kind: true, status: true } } },
    }),
    prisma.serviceVisit.findMany({ where: { status: "COMPLETED", round: { communityId } }, select: { roundId: true, startsAt: true } }),
  ]);
  const savedPaise = savingsVsMrp(items.map((i) => ({ mrpPaise: i.offering.mrpPaise, quantity: i.quantity, finalPaise: i.finalPaise ?? 0 })));
  const deliveries = items
    .filter((i) => i.round.kind === "GROCERY" && i.round.status === "COMPLETED")
    .map((i) => ({ roundId: i.roundId, flatId: i.flatId, vendorId: i.offering.vendorId }));
  const trips = countTrips(
    deliveries,
    visits.map((v) => ({ roundId: v.roundId, day: utcToIstDate(v.startsAt) })),
  );
  return communityImpact({ savedPaise, trips }, DEFAULT_IMPACT_ASSUMPTIONS);
}

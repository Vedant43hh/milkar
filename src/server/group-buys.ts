import "server-only";
import { buyCategoryOf, type BuyCategory } from "@/lib/categories";
import { prisma } from "@/lib/db";
import type { Tier } from "@/lib/pricing/tiers";
import { roundStats } from "@/lib/rounds";

/**
 * The group buys open in a resident's community, as cards: the item closest to a better price,
 * which flats have joined (flat numbers only), and the resident's own order or booking.
 */
export async function openGroupBuys(user: { id: string; flatId: string; communityId: string }, now: Date) {
  const rounds = await prisma.orderRound.findMany({
    where: { communityId: user.communityId, status: "OPEN", cutoffAt: { gt: now } },
    orderBy: { cutoffAt: "asc" },
    include: {
      service: { select: { name: true, category: true } },
      offerings: {
        include: {
          product: { select: { name: true, unit: true } },
          serviceOption: { select: { name: true } },
          orderItems: { select: { userId: true, flatId: true, quantity: true, chargedPaise: true, updatedAt: true, flat: { select: { tower: true, number: true } } } },
        },
      },
      bookings: { where: { flatId: user.flatId, status: "ACTIVE" }, select: { slot: { select: { startsAt: true } } } },
    },
  });

  return rounds.map((round) => {
    const stats = roundStats(
      round.offerings.map((o) => ({
        id: o.id,
        tierGroupKey: o.tierGroupKey,
        pricing: { tierBasis: o.tierBasis, tiers: o.tiers as Tier[], marginBps: round.marginBps, gstBps: o.gstBps, minOrderQty: o.minOrderQty, mrpPaise: o.mrpPaise },
        items: o.orderItems,
      })),
    );
    // The item to show: closest to a better price, else still short of the minimum, else the most popular.
    const lead = stats.closeToUnlock[0] ?? stats.belowMinimum[0] ?? [...stats.offerings].sort((a, b) => b.units - a.units)[0] ?? null;
    const leadOffering = lead ? round.offerings.find((o) => o.id === lead.id) : null;

    // Flats that joined, most recent first; never names.
    const items = round.offerings.flatMap((o) => o.orderItems).filter((i) => i.quantity > 0);
    const latest = new Map<string, { label: string; at: number }>();
    for (const i of items) {
      const at = i.updatedAt.getTime();
      const seen = latest.get(i.flatId);
      if (!seen || at > seen.at) latest.set(i.flatId, { label: `${i.flat.tower}-${i.flat.number}`, at });
    }
    const flats = [...latest.values()].sort((a, b) => b.at - a.at).map((f) => f.label);

    const mine = items.filter((i) => i.userId === user.id);
    const category: BuyCategory = buyCategoryOf({ kind: round.kind, repeatWeekly: round.repeatWeekly, serviceCategory: round.service?.category });
    return {
      id: round.id,
      kind: round.kind,
      category,
      title: round.title,
      cutoffAt: round.cutoffAt,
      href: round.kind === "SERVICE" ? `/app/services/${round.id}` : `/app/groceries?round=${round.id}`,
      itemCount: round.offerings.length,
      lead:
        lead && leadOffering
          ? {
              name: leadOffering.product?.name ?? leadOffering.serviceOption?.name ?? "",
              meter: lead.meter,
              mrpPaise: leadOffering.mrpPaise,
              unitLabel: leadOffering.unitLabel,
              basis: leadOffering.tierBasis,
              productUnit: leadOffering.product?.unit ?? null,
            }
          : null,
      flats,
      myUnits: mine.reduce((n, i) => n + i.quantity, 0),
      myPaidPaise: mine.reduce((s, i) => s + i.chargedPaise, 0),
      booking: round.bookings[0] ?? null,
    };
  });
}

export type GroupBuy = Awaited<ReturnType<typeof openGroupBuys>>[number];

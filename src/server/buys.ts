import "server-only";
import { BUY_CATEGORIES, buyCategoryOf, type BuyCategory } from "@/lib/categories";
import { prisma } from "@/lib/db";

/** How many group buys are open in a community, per category, for the Group buys hub. */
export async function openBuysByCategory(communityId: string, now: Date): Promise<Record<BuyCategory, number>> {
  const rounds = await prisma.orderRound.findMany({
    where: { communityId, status: "OPEN", cutoffAt: { gt: now } },
    select: { kind: true, repeatWeekly: true, service: { select: { category: true } } },
  });
  const counts = Object.fromEntries(BUY_CATEGORIES.map((c) => [c, 0])) as Record<BuyCategory, number>;
  for (const round of rounds) counts[buyCategoryOf({ kind: round.kind, repeatWeekly: round.repeatWeekly, serviceCategory: round.service?.category })]++;
  return counts;
}

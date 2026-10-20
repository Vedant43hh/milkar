import "server-only";
import { t } from "@/i18n";
import { prisma } from "@/lib/db";
import { groupBasis } from "@/lib/pricing/basis";
import { canAdd, canReduce, reductionFreezeAt } from "@/lib/pricing/rules";
import type { Tier } from "@/lib/pricing/tiers";
import type { UnitWords } from "@/lib/rounds";
import type { Shopper } from "./checkout";
import { walletBalance } from "./wallet";

/** One product in the shop, with the community's count and this resident's household position. */
export type ShopItem = {
  id: string;
  name: string;
  pack: string;
  category: string;
  categoryLabel: string;
  words: UnitWords;
  mrpPaise: number;
  tiers: Tier[];
  gstBps: number;
  minOrderQty: number;
  maxQtyPerFlat: number;
  /** Units the whole community holds. */
  basisCount: number;
  myQty: number;
  myPaidPaise: number;
  flatOthersQty: number;
};

export type Shop = {
  round: {
    id: string;
    title: string;
    cutoffAt: string;
    freezeAt: string;
    deliveryAt: string;
    marginBps: number;
    canAdd: boolean;
    canReduce: boolean;
  };
  items: ShopItem[];
  walletPaise: number;
};

const PACK_UNITS = new Set(["KG", "G", "LITRE", "ML"]);

function packWords(unit: string): UnitWords {
  const key = unit === "PACKET" ? "packet" : unit === "PIECE" ? "piece" : unit === "DOZEN" ? "dozen" : "pack";
  return { one: t(`packWords.${key}.one`), other: t(`packWords.${key}.other`) };
}

/** Grocery rounds a resident can order in right now, soonest cutoff first. */
export async function openGroceryRounds(communityId: string, now: Date) {
  return prisma.orderRound.findMany({
    where: { communityId, kind: "GROCERY", status: "OPEN", cutoffAt: { gt: now } },
    orderBy: { cutoffAt: "asc" },
    select: { id: true, title: true, cutoffAt: true },
  });
}

/** Everything the groceries screen needs for one round, or null if it isn't open to this resident. */
export async function getShop(shopper: Shopper, roundId: string, now: Date): Promise<Shop | null> {
  const round = await prisma.orderRound.findFirst({
    where: { id: roundId, communityId: shopper.communityId, kind: "GROCERY" },
    include: {
      offerings: {
        include: {
          product: { select: { name: true, unit: true, packSize: true, category: true } },
          orderItems: { select: { userId: true, flatId: true, quantity: true, chargedPaise: true } },
        },
      },
    },
  });
  if (!round) return null;
  const items = round.offerings
    .filter((o) => o.product)
    .map((o): ShopItem => {
      const p = o.product!;
      const mine = o.orderItems.find((i) => i.userId === shopper.id);
      return {
        id: o.id,
        name: p.name,
        pack: PACK_UNITS.has(p.unit) ? `${p.packSize} ${t(`units.${p.unit}`)}` : "",
        category: p.category,
        categoryLabel: t(`categories.${p.category}`),
        words: packWords(p.unit),
        mrpPaise: o.mrpPaise,
        tiers: o.tiers as Tier[],
        gstBps: o.gstBps,
        minOrderQty: o.minOrderQty,
        maxQtyPerFlat: o.maxQtyPerFlat,
        basisCount: groupBasis(o.orderItems, o.tierBasis),
        myQty: mine?.quantity ?? 0,
        myPaidPaise: mine?.chargedPaise ?? 0,
        flatOthersQty: o.orderItems.filter((i) => i.flatId === shopper.flatId && i.userId !== shopper.id).reduce((n, i) => n + i.quantity, 0),
      };
    })
    .sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name));

  return {
    round: {
      id: round.id,
      title: round.title,
      cutoffAt: round.cutoffAt.toISOString(),
      freezeAt: reductionFreezeAt(round).toISOString(),
      deliveryAt: round.deliveryAt.toISOString(),
      marginBps: round.marginBps,
      canAdd: canAdd(round, now),
      canReduce: canReduce(round, now),
    },
    items,
    walletPaise: await walletBalance(prisma, shopper.id),
  };
}

import "server-only";
import { prisma } from "@/lib/db";
import { groupBasis } from "@/lib/pricing/basis";
import { unitPriceAt } from "@/lib/pricing/price";
import { canAdd, canReduce, reductionFreezeAt } from "@/lib/pricing/rules";
import type { Tier } from "@/lib/pricing/tiers";
import { unitWordsFor, type UnitWords } from "@/lib/rounds";
import { seatsLeft } from "@/lib/services/slots";
import { formatIST } from "@/lib/time";
import { lastWeekTargets } from "./bookings";
import type { Shopper } from "./checkout";
import { walletBalance } from "./wallet";

export type ServiceOptionRow = {
  id: string;
  name: string;
  unitLabel: string;
  mrpPaise: number;
  tiers: Tier[];
  gstBps: number;
  minOrderQty: number;
  maxQtyPerFlat: number;
  myQty: number;
  myPaidPaise: number;
  flatOthersQty: number;
};

export type ServiceDay = {
  round: {
    id: string;
    title: string;
    cutoffAt: string;
    freezeAt: string;
    marginBps: number;
    canAdd: boolean;
    canReduce: boolean;
    repeatWeekly: boolean;
    noAccessFeePaise: number;
  };
  service: { name: string; description: string; durationMinutes: number; vendor: string; verified: boolean; rating: { average: string; count: number } | null };
  options: ServiceOptionRow[];
  /** Distinct flats booked across all options right now. */
  basisCount: number;
  /** Units other members of this flat hold, so the flat keeps its visit if they remain. */
  flatOthersUnits: number;
  slots: { id: string; day: string; time: string; label: string; seatsLeft: number }[];
  booking: { status: "ACTIVE" | "HELD"; slotId: string; slotLabel: string; holdUntil: string | null; keepSlotWeekly: boolean; autoPayFromWallet: boolean } | null;
  /** For a held weekly slot: last week's units, filled in. */
  prefill: Record<string, number> | null;
  flatWords: UnitWords;
  walletPaise: number;
};

/** "Mon, 26 Oct" */
function dayLabel(at: Date) {
  const full = formatIST(at); // "Mon, 26 Oct, 9:00 am"
  return full.slice(0, full.lastIndexOf(","));
}

function slotLabels(slot: { startsAt: Date; endsAt: Date }) {
  const day = dayLabel(slot.startsAt);
  const time = `${formatIST(slot.startsAt, "time")} – ${formatIST(slot.endsAt, "time")}`;
  return { day, time, label: `${formatIST(slot.startsAt)} – ${formatIST(slot.endsAt, "time")}` };
}

/** Everything the Service Day screen needs, or null if it isn't this resident's to book. */
export async function getServiceDay(shopper: Shopper, roundId: string, unitLabel: string, now: Date): Promise<ServiceDay | null> {
  const round = await prisma.orderRound.findFirst({
    where: { id: roundId, communityId: shopper.communityId, kind: "SERVICE" },
    include: {
      service: { include: { vendor: { select: { name: true, verificationStatus: true, ratingCount: true, ratingSum: true } } } },
      offerings: {
        include: {
          serviceOption: { select: { name: true, sortOrder: true } },
          orderItems: { select: { userId: true, flatId: true, quantity: true, chargedPaise: true } },
        },
      },
      slots: { orderBy: { startsAt: "asc" } },
      bookings: { where: { flatId: shopper.flatId } },
    },
  });
  if (!round || !round.service) return null;
  const offerings = [...round.offerings].sort((a, b) => (a.serviceOption?.sortOrder ?? 0) - (b.serviceOption?.sortOrder ?? 0));
  const allItems = offerings.flatMap((o) => o.orderItems);
  const raw = round.bookings[0];
  const held = raw?.status === "HELD" && raw.holdExpiresAt && raw.holdExpiresAt.getTime() > now.getTime();
  const booking = raw && (raw.status === "ACTIVE" || held) ? raw : null;
  const slotOf = (id: string) => round.slots.find((s) => s.id === id);
  const { vendor } = round.service;

  return {
    round: {
      id: round.id,
      title: round.title,
      cutoffAt: round.cutoffAt.toISOString(),
      freezeAt: reductionFreezeAt(round).toISOString(),
      marginBps: round.marginBps,
      canAdd: canAdd(round, now),
      canReduce: canReduce(round, now),
      repeatWeekly: round.repeatWeekly,
      noAccessFeePaise: round.noAccessFeePaise ?? round.service.noAccessFeePaise,
    },
    service: {
      name: round.service.name,
      description: round.service.description,
      durationMinutes: round.service.durationMinutes,
      vendor: vendor.name,
      verified: vendor.verificationStatus === "VERIFIED",
      rating: vendor.ratingCount > 0 ? { average: (vendor.ratingSum / vendor.ratingCount).toFixed(1), count: vendor.ratingCount } : null,
    },
    options: offerings.map((o) => {
      const mine = o.orderItems.find((i) => i.userId === shopper.id);
      return {
        id: o.id,
        name: o.serviceOption?.name ?? "",
        unitLabel: o.unitLabel ?? "unit",
        mrpPaise: o.mrpPaise,
        tiers: o.tiers as Tier[],
        gstBps: o.gstBps,
        minOrderQty: o.minOrderQty,
        maxQtyPerFlat: o.maxQtyPerFlat,
        myQty: mine?.quantity ?? 0,
        myPaidPaise: mine?.chargedPaise ?? 0,
        flatOthersQty: o.orderItems.filter((i) => i.flatId === shopper.flatId && i.userId !== shopper.id).reduce((n, i) => n + i.quantity, 0),
      };
    }),
    basisCount: groupBasis(allItems, "FLATS"),
    flatOthersUnits: allItems.filter((i) => i.flatId === shopper.flatId && i.userId !== shopper.id).reduce((n, i) => n + i.quantity, 0),
    slots: round.slots.map((slot) => ({ id: slot.id, ...slotLabels(slot), seatsLeft: seatsLeft(slot) })),
    booking: booking
      ? {
          status: booking.status as "ACTIVE" | "HELD",
          slotId: booking.slotId,
          slotLabel: slotOf(booking.slotId) ? slotLabels(slotOf(booking.slotId)!).label : "",
          holdUntil: booking.status === "HELD" ? formatIST(booking.holdExpiresAt!) : null,
          keepSlotWeekly: booking.keepSlotWeekly,
          autoPayFromWallet: booking.autoPayFromWallet,
        }
      : null,
    prefill: booking?.status === "HELD" ? await lastWeekTargets(booking.id, shopper.id) : null,
    flatWords: unitWordsFor(unitLabel),
    walletPaise: await walletBalance(prisma, shopper.id),
  };
}

/** Open Service Days for the services tab, with the cheapest current price and this flat's booking. */
export async function listServiceDays(communityId: string, flatId: string, now: Date) {
  const rounds = await prisma.orderRound.findMany({
    where: { communityId, kind: "SERVICE", status: "OPEN", cutoffAt: { gt: now } },
    orderBy: { cutoffAt: "asc" },
    include: {
      service: { include: { vendor: { select: { name: true, verificationStatus: true, ratingCount: true, ratingSum: true } } } },
      offerings: { include: { orderItems: { select: { flatId: true, quantity: true } } } },
      slots: { orderBy: { startsAt: "asc" }, select: { startsAt: true } },
      bookings: { where: { flatId, status: { in: ["ACTIVE", "HELD"] } }, select: { status: true, holdExpiresAt: true, slot: { select: { startsAt: true, endsAt: true } } } },
    },
  });
  return rounds.map((round) => {
    const flats = groupBasis(round.offerings.flatMap((o) => o.orderItems), "FLATS");
    const prices = round.offerings.map((o) => ({
      unitLabel: o.unitLabel ?? "unit",
      paise: unitPriceAt({ tiers: o.tiers as Tier[], marginBps: round.marginBps, gstBps: o.gstBps }, flats).totalPaise,
    }));
    const cheapest = prices.sort((a, b) => a.paise - b.paise)[0] ?? null;
    const booking = round.bookings.find((b) => b.status === "ACTIVE" || (b.holdExpiresAt && b.holdExpiresAt.getTime() > now.getTime())) ?? null;
    const first = round.offerings[0];
    return {
      id: round.id,
      title: round.title,
      cutoffAt: round.cutoffAt,
      serviceName: round.service?.name ?? round.title,
      vendor: round.service?.vendor.name ?? "",
      verified: round.service?.vendor.verificationStatus === "VERIFIED",
      days: [...new Set(round.slots.map((s) => dayLabel(s.startsAt)))],
      flats,
      minFlats: first?.minOrderQty ?? 0,
      meterInput: first
        ? { tierBasis: "FLATS" as const, tiers: first.tiers as Tier[], marginBps: round.marginBps, gstBps: first.gstBps, minOrderQty: first.minOrderQty, mrpPaise: first.mrpPaise }
        : null,
      cheapest,
      booking: booking ? { status: booking.status, label: `${formatIST(booking.slot.startsAt)} – ${formatIST(booking.slot.endsAt, "time")}` } : null,
    };
  });
}

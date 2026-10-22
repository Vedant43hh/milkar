import "server-only";
import type { Unit } from "@/generated/prisma/client";
import { t } from "@/i18n";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { roundMoney } from "@/lib/history";
import { buildInvoice, invoiceNumber } from "@/lib/invoice";
import { checkReport, issueDeadline } from "@/lib/services/issues";
import { visitTimeline } from "@/lib/services/timeline";
import { walletBalance } from "./wallet";

// A resident's orders and bookings: what they bought in each round, what they paid and got back,
// their visits, their invoices and their wallet. Orders belong to the resident; visits belong to
// the flat, so everyone living there sees them.

export type HistoryUser = { id: string; flatId: string; communityId: string };

const PACK_UNITS = new Set(["KG", "G", "LITRE", "ML"]);

/** "Sona Masoori Rice, 5 kg" or "Split AC". */
function itemName(offering: { product: { name: string; unit: Unit; packSize: number } | null; serviceOption: { name: string } | null }): string {
  const p = offering.product;
  if (p) return PACK_UNITS.has(p.unit) ? `${p.name}, ${p.packSize} ${t(`units.${p.unit}`)}` : p.name;
  return offering.serviceOption?.name ?? "";
}

/** Rounds this resident ordered in, or their flat booked: newest first. */
export async function listOrderHistory(user: HistoryUser) {
  const rounds = await prisma.orderRound.findMany({
    where: {
      communityId: user.communityId,
      OR: [{ orderItems: { some: { userId: user.id } } }, { payments: { some: { userId: user.id, status: "PAID" } } }, { bookings: { some: { flatId: user.flatId, status: "ACTIVE" } } }],
    },
    orderBy: [{ cutoffAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      kind: true,
      title: true,
      status: true,
      cutoffAt: true,
      deliveryAt: true,
      finalizedAt: true,
      service: { select: { name: true } },
      orderItems: { where: { userId: user.id }, select: { quantity: true, status: true } },
      payments: { where: { userId: user.id }, select: { status: true, chargePaise: true } },
      walletTransactions: { where: { userId: user.id }, select: { type: true, amountPaise: true } },
      visits: { where: { flatId: user.flatId }, orderBy: { startsAt: "asc" }, select: { status: true, startsAt: true } },
    },
  });
  return rounds.map((round) => {
    const live = round.orderItems.filter((i) => i.quantity > 0 && i.status !== "CANCELLED" && i.status !== "DROPPED");
    const nextVisit = round.visits.find((v) => v.status === "SCHEDULED" || v.status === "ON_THE_WAY" || v.status === "IN_PROGRESS") ?? null;
    return {
      id: round.id,
      kind: round.kind,
      title: round.title,
      status: round.status,
      serviceName: round.service?.name ?? null,
      /** When it was settled, or when it closes. */
      date: round.finalizedAt ?? round.cutoffAt,
      takingOrders: round.status === "OPEN",
      units: live.reduce((n, i) => n + i.quantity, 0),
      money: roundMoney(round.payments, round.walletTransactions),
      nextVisit,
      lastVisitStatus: round.visits.at(-1)?.status ?? null,
    };
  });
}

export type OrderHistoryEntry = Awaited<ReturnType<typeof listOrderHistory>>[number];

/** Everything about one round for this resident, or null if it isn't theirs. */
export async function getRoundHistory(user: HistoryUser, roundId: string, now: Date) {
  const round = await prisma.orderRound.findFirst({
    where: {
      id: roundId,
      communityId: user.communityId,
      OR: [{ orderItems: { some: { userId: user.id } } }, { payments: { some: { userId: user.id, status: "PAID" } } }, { bookings: { some: { flatId: user.flatId, status: "ACTIVE" } } }],
    },
    select: {
      id: true,
      number: true,
      kind: true,
      title: true,
      status: true,
      cutoffAt: true,
      deliveryAt: true,
      finalizedAt: true,
      completedAt: true,
      cancelledAt: true,
      cancelReason: true,
      requirePickupCode: true,
      service: { select: { name: true, vendor: { select: { name: true } } } },
      orderItems: {
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          status: true,
          chargedPaise: true,
          finalPaise: true,
          refundPaise: true,
          absorbedPaise: true,
          shortQty: true,
          damagedQty: true,
          issueRefundPaise: true,
          offering: {
            select: {
              mrpPaise: true,
              gstBps: true,
              unitLabel: true,
              finalUnitPricePaise: true,
              product: { select: { name: true, unit: true, packSize: true } },
              serviceOption: { select: { name: true } },
              vendor: { select: { name: true } },
            },
          },
        },
      },
      payments: { where: { userId: user.id }, select: { status: true, chargePaise: true } },
      walletTransactions: { where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, type: true, amountPaise: true, createdAt: true } },
      visits: {
        where: { flatId: user.flatId },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          kind: true,
          status: true,
          startsAt: true,
          endsAt: true,
          technicianName: true,
          completionCode: true,
          createdAt: true,
          onTheWayAt: true,
          startedAt: true,
          completedAt: true,
          noAccessAt: true,
          cancelledAt: true,
          cancelReason: true,
          rating: { select: { rating: true, comment: true, userId: true } },
          issue: { select: { kind: true, status: true, note: true, resolution: true, createdAt: true } },
        },
      },
      distributionRecords: { where: { flatId: user.flatId }, select: { pickupCode: true, status: true, collectedAt: true } },
    },
  });
  if (!round) return null;

  const items = round.orderItems
    .filter((i) => i.quantity > 0 || i.chargedPaise > 0 || (i.finalPaise ?? 0) > 0 || i.status === "DROPPED")
    .map((i) => ({
      id: i.id,
      name: itemName(i.offering),
      vendor: i.offering.vendor.name,
      unitLabel: i.offering.unitLabel,
      quantity: i.quantity,
      status: i.status,
      chargedPaise: i.chargedPaise,
      finalPaise: i.finalPaise,
      finalUnitPaise: i.offering.finalUnitPricePaise,
      refundPaise: i.refundPaise ?? 0,
      mrpPaise: i.offering.mrpPaise,
      shortQty: i.shortQty,
      damagedQty: i.damagedQty,
      issueRefundPaise: i.issueRefundPaise,
    }));

  const visits = round.visits.map((v) => {
    const report = checkReport({ visit: v, hasIssue: v.issue !== null, now });
    const ended = v.status === "COMPLETED" ? v.completedAt : v.status === "NO_ACCESS" ? v.noAccessAt : null;
    return {
      ...v,
      // The code is only needed until the job is done.
      completionCode: v.status === "SCHEDULED" || v.status === "ON_THE_WAY" || v.status === "IN_PROGRESS" ? v.completionCode : null,
      timeline: visitTimeline(v),
      canRate: v.status === "COMPLETED" && v.rating === null,
      ratedByYou: v.rating?.userId === user.id,
      report: report.ok ? { kind: report.kind, deadline: report.deadline } : null,
      reportClosedAt: !report.ok && report.error === "WINDOW_CLOSED" && ended ? issueDeadline(ended) : null,
    };
  });

  return {
    round: {
      id: round.id,
      number: round.number,
      kind: round.kind,
      title: round.title,
      status: round.status,
      cutoffAt: round.cutoffAt,
      deliveryAt: round.deliveryAt,
      finalizedAt: round.finalizedAt,
      completedAt: round.completedAt,
      cancelledAt: round.cancelledAt,
      cancelReason: round.cancelReason,
      requirePickupCode: round.requirePickupCode,
      serviceName: round.service?.name ?? null,
      vendor: round.service?.vendor.name ?? null,
    },
    items,
    money: roundMoney(round.payments, round.walletTransactions),
    credits: round.walletTransactions.filter((w) => w.amountPaise > 0),
    visits,
    pickup: round.distributionRecords[0] ?? null,
    hasInvoice: hasInvoice(round),
  };
}

export type RoundHistory = NonNullable<Awaited<ReturnType<typeof getRoundHistory>>>;

/** An invoice exists once final prices are set and something was actually bought. */
function hasInvoice(round: { finalizedAt: Date | null; status: string; orderItems: { status: string; quantity: number; finalPaise: number | null }[] }): boolean {
  return (
    round.finalizedAt !== null && round.status !== "CANCELLED" && round.orderItems.some((i) => i.status === "CONFIRMED" && i.quantity > 0 && (i.finalPaise ?? 0) > 0)
  );
}

/** The GST invoice for this resident's confirmed items in a round, or null if there's none. */
export async function getInvoice(user: HistoryUser & { name: string | null }, roundId: string) {
  const round = await prisma.orderRound.findFirst({
    where: { id: roundId, communityId: user.communityId, orderItems: { some: { userId: user.id } } },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      finalizedAt: true,
      community: { select: { name: true, address: true, city: true, pincode: true, unitLabel: true } },
      orderItems: {
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
        select: {
          status: true,
          quantity: true,
          finalPaise: true,
          offering: { select: { gstBps: true, product: { select: { name: true, unit: true, packSize: true } }, serviceOption: { select: { name: true } }, round: { select: { service: { select: { name: true } } } } } },
        },
      },
      payments: { where: { userId: user.id }, select: { status: true, chargePaise: true } },
      walletTransactions: { where: { userId: user.id }, select: { type: true, amountPaise: true } },
    },
  });
  if (!round || !round.finalizedAt || !hasInvoice(round)) return null;
  const flat = await prisma.flat.findUniqueOrThrow({ where: { id: user.flatId }, select: { tower: true, number: true } });
  const { community } = round;

  const invoice = buildInvoice({
    number: invoiceNumber(round.number, user.id),
    date: round.finalizedAt,
    supplier: { name: "Milkar", gstin: getEnv().PLATFORM_GSTIN ?? null, address: "" },
    buyer: {
      name: user.name ?? "",
      address: `${community.unitLabel} ${flat.tower}-${flat.number}, ${community.name}, ${community.address}, ${community.city} ${community.pincode}`,
      pincode: community.pincode,
    },
    lines: round.orderItems
      .filter((i) => i.status === "CONFIRMED" && i.quantity > 0 && (i.finalPaise ?? 0) > 0)
      .map((i) => {
        const service = i.offering.round.service?.name;
        const name = itemName(i.offering);
        return { description: service ? `${service} · ${name}` : name, quantity: i.quantity, amountPaise: i.finalPaise ?? 0, gstBps: i.offering.gstBps };
      }),
  });
  return { invoice, round: { id: round.id, title: round.title }, money: roundMoney(round.payments, round.walletTransactions) };
}

/** The wallet: balance, and the ledger newest first with what each entry was for. */
export async function getWalletLedger(userId: string, take = 100) {
  const [balancePaise, entries, count] = await Promise.all([
    walletBalance(prisma, userId),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, type: true, amountPaise: true, createdAt: true, note: true, round: { select: { id: true, title: true } } },
    }),
    prisma.walletTransaction.count({ where: { userId } }),
  ]);
  return { balancePaise, entries, hasMore: count > entries.length };
}

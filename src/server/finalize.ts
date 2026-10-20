import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { buildVendorOrders, type ConfirmedOffering } from "@/lib/pricing/consolidate";
import { computeFinalization } from "@/lib/pricing/finalize";
import type { Tier } from "@/lib/pricing/tiers";
import { isDueForFinalize } from "@/lib/rounds";
import { holdExpiresAt, nextWeekDays, oneWeekLater, planHolds } from "@/lib/services/slots";
import { formatCompletionCode } from "@/lib/services/visit";
import { autoPayHoldIn } from "./bookings";
import { notify } from "./notifications";
import { lockRound } from "./round-lock";
import { openRoundInTx } from "./rounds";
import { releaseSeat, takeSeat } from "./slots";

type Tx = Prisma.TransactionClient;

export type FinalizeSummary = {
  roundId: string;
  confirmedOfferings: number;
  droppedOfferings: number;
  refundsPaise: number;
  vendorOrders: number;
  pickups: number;
  visits: number;
  /** Next week's round of a repeating Service Day, with the slots kept for last week's residents. */
  nextRoundId: string | null;
  held: number;
  autoPaid: number;
};

export type FinalizeOutcome = ({ status: "FINALIZED" } & FinalizeSummary) | { status: "NOT_FOUND" | "NOT_OPEN" | "NOT_DUE" };

// A round touches every order in it; give it room on a busy database.
const TX_OPTIONS = { maxWait: 15_000, timeout: 120_000 };

const newCode = () => formatCompletionCode(randomInt(0, 10_000));

async function loadForFinalize(tx: Tx, roundId: string) {
  return tx.orderRound.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      community: { select: { name: true } },
      service: { select: { name: true } },
      offerings: {
        include: {
          product: { select: { name: true } },
          serviceOption: { select: { name: true } },
          orderItems: {
            select: {
              id: true,
              userId: true,
              flatId: true,
              quantity: true,
              chargedPaise: true,
              lots: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { quantity: true, unitPricePaise: true } },
            },
          },
        },
      },
      slots: { select: { startsAt: true } },
      bookings: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { slot: { select: { startsAt: true, endsAt: true } } } },
    },
  });
}

type FinalizeRound = Awaited<ReturnType<typeof loadForFinalize>>;

/**
 * The cutoff job for one round, in a single transaction under the round lock. Works out final
 * prices with the pure engine, refunds the difference (or everything, for what didn't reach its
 * minimum) to wallets with one idempotent credit per order item, issues vendor orders, and then:
 * groceries get a pickup code per flat; Service Days get a visit with a completion code per
 * booked flat. A repeating Service Day also opens next week's round, holding last week's slots
 * and paying for them from the wallet where residents asked. Safe to run twice: the second run
 * finds the round already finalized.
 */
export async function finalizeRound(roundId: string, now: Date): Promise<FinalizeOutcome> {
  return prisma.$transaction(async (tx): Promise<FinalizeOutcome> => {
    if (!(await lockRound(tx, roundId))) return { status: "NOT_FOUND" };
    const round = await loadForFinalize(tx, roundId);
    if (round.status !== "OPEN") return { status: "NOT_OPEN" };
    if (!isDueForFinalize(round, now)) return { status: "NOT_DUE" };

    // Quotes still waiting at the gateway stop here; money that arrives later goes to the wallet.
    await tx.payment.updateMany({ where: { roundId, status: "CREATED" }, data: { status: "EXPIRED", failureReason: "Round closed" } });

    const result = computeFinalization({
      marginBps: round.marginBps,
      offerings: round.offerings.map((o) => ({
        offeringId: o.id,
        tierGroupKey: o.tierGroupKey,
        tierBasis: o.tierBasis,
        tiers: o.tiers as Tier[],
        gstBps: o.gstBps,
        minOrderQty: o.minOrderQty,
        items: o.orderItems.map((i) => ({
          orderItemId: i.id,
          userId: i.userId,
          flatId: i.flatId,
          chargedPaise: i.chargedPaise,
          lots: i.lots.map((lot, index) => ({ ...lot, seq: index + 1 })),
        })),
      })),
    });

    const offeringById = new Map(round.offerings.map((o) => [o.id, o]));
    const credits: Prisma.WalletTransactionCreateManyInput[] = [];
    const refundsByUser = new Map<string, { TIER_REFUND: number; DROP_REFUND: number }>();
    const confirmedOfferings: ConfirmedOffering[] = [];
    /** flatId → residents with confirmed units in it */
    const confirmedFlats = new Map<string, Set<string>>();

    for (const f of result.offerings) {
      const offering = offeringById.get(f.offeringId)!;
      await tx.roundOffering.update({
        where: { id: f.offeringId },
        data: {
          status: f.status,
          finalQty: f.totalQty,
          finalBasisCount: f.basisCount,
          finalVendorPricePaise: f.tier?.vendorPricePaise ?? null,
          finalUnitPricePaise: f.unit?.totalPaise ?? null,
        },
      });
      if (f.status === "CONFIRMED" && f.tier) {
        confirmedOfferings.push({
          offeringId: f.offeringId,
          productId: offering.productId,
          serviceOptionId: offering.serviceOptionId,
          vendorId: offering.vendorId,
          totalQty: f.totalQty,
          vendorPricePaise: f.tier.vendorPricePaise,
          gstBps: offering.gstBps,
        });
      }
      const type = f.status === "DROPPED" ? "DROP_REFUND" : "TIER_REFUND";
      for (const item of f.items) {
        await tx.orderItem.update({
          where: { id: item.orderItemId },
          data: { status: f.status, finalPaise: item.finalPaise, refundPaise: item.refundPaise, absorbedPaise: item.absorbedPaise },
        });
        if (f.status === "CONFIRMED") confirmedFlats.set(item.flatId, (confirmedFlats.get(item.flatId) ?? new Set()).add(item.userId));
        if (item.refundPaise > 0) {
          credits.push({
            userId: item.userId,
            amountPaise: item.refundPaise,
            type,
            roundId,
            orderItemId: item.orderItemId,
            idempotencyKey: `${type}:${item.orderItemId}`,
            createdAt: now,
          });
          const sums = refundsByUser.get(item.userId) ?? { TIER_REFUND: 0, DROP_REFUND: 0 };
          sums[type] += item.refundPaise;
          refundsByUser.set(item.userId, sums);
        }
      }
    }
    await tx.walletTransaction.createMany({ data: credits, skipDuplicates: true });

    const vendorOrders = await issueVendorOrders(tx, round, confirmedOfferings, now);
    const pickups = round.kind === "GROCERY" ? await createPickups(tx, round, [...confirmedFlats.keys()]) : 0;
    const visits = round.kind === "SERVICE" ? await scheduleVisits(tx, round, confirmedFlats, now) : 0;

    await tx.orderRound.update({ where: { id: roundId }, data: { status: "FINALIZED", finalizedAt: now, version: { increment: 1 } } });

    for (const [userId, sums] of refundsByUser) {
      for (const reason of ["TIER_REFUND", "DROP_REFUND"] as const) {
        if (sums[reason] === 0) continue;
        await notify(
          tx,
          [userId],
          { type: "REFUND_CREDITED", params: { amountPaise: sums[reason], reason, round: round.title }, href: "/wallet" },
          { dedupeKey: notificationKeys.refund(`${reason}:${roundId}`), now },
        );
      }
    }
    const confirmedUsers = [...new Set([...confirmedFlats.values()].flatMap((users) => [...users]))];
    await notify(tx, confirmedUsers, { type: "ROUND_FINALIZED", params: { round: round.title }, href: `/round/${roundId}` }, { dedupeKey: notificationKeys.roundFinalized(roundId), now });

    const next = round.kind === "SERVICE" && round.repeatWeekly ? await openNextWeek(tx, round, now) : { nextRoundId: null, held: 0, autoPaid: 0 };

    return {
      status: "FINALIZED",
      roundId,
      confirmedOfferings: result.offerings.filter((f) => f.status === "CONFIRMED").length,
      droppedOfferings: result.offerings.filter((f) => f.status === "DROPPED").length,
      refundsPaise: result.totals.refundsPaise,
      vendorOrders,
      pickups,
      visits,
      ...next,
    };
  }, TX_OPTIONS);
}

/** One order per vendor, with its lines; the vendor's users are told. */
async function issueVendorOrders(tx: Tx, round: FinalizeRound, confirmed: ConfirmedOffering[], now: Date): Promise<number> {
  const drafts = buildVendorOrders(confirmed);
  for (const draft of drafts) {
    const order = await tx.vendorOrder.create({
      data: {
        roundId: round.id,
        vendorId: draft.vendorId,
        subtotalPaise: draft.subtotalPaise,
        gstPaise: draft.gstPaise,
        totalPaise: draft.totalPaise,
        createdAt: now,
        lines: { create: draft.lines },
      },
    });
    const staff = await tx.user.findMany({ where: { vendorId: draft.vendorId, role: "VENDOR" }, select: { id: true } });
    await notify(
      tx,
      staff.map((u) => u.id),
      { type: "VENDOR_ORDER", params: { round: round.title, community: round.community.name }, href: "/vendor/orders" },
      { dedupeKey: notificationKeys.vendorOrder(order.id), now },
    );
  }
  return drafts.length;
}

/** Groceries: a pickup code for every flat with something confirmed, checked at distribution. */
async function createPickups(tx: Tx, round: FinalizeRound, flatIds: string[]): Promise<number> {
  const { count } = await tx.distributionRecord.createMany({
    data: flatIds.map((flatId) => ({ roundId: round.id, flatId, pickupCode: newCode() })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * Service Days: a visit with its own completion code for every booked flat whose units were
 * confirmed. Every other booking (holds nobody confirmed, a Service Day that didn't reach its
 * minimum) is cancelled and its seat given back.
 */
async function scheduleVisits(tx: Tx, round: FinalizeRound, confirmedFlats: Map<string, Set<string>>, now: Date): Promise<number> {
  const service = round.service?.name ?? round.title;
  let visits = 0;
  const bookings = [...round.bookings].sort((a, b) => a.slot.startsAt.getTime() - b.slot.startsAt.getTime());
  for (const booking of bookings) {
    const residents = confirmedFlats.get(booking.flatId);
    if (booking.status === "ACTIVE" && residents) {
      const visit = await tx.serviceVisit.create({
        data: {
          roundId: round.id,
          bookingId: booking.id,
          flatId: booking.flatId,
          slotId: booking.slotId,
          kind: "STANDARD",
          status: "SCHEDULED",
          startsAt: booking.slot.startsAt,
          endsAt: booking.slot.endsAt,
          completionCode: newCode(),
          createdAt: now,
        },
      });
      visits++;
      await notify(
        tx,
        [...residents],
        { type: "VISIT_SCHEDULED", params: { service, startsAt: visit.startsAt.toISOString(), code: visit.completionCode }, href: `/round/${round.id}` },
        { dedupeKey: notificationKeys.visit(visit.id, "SCHEDULED"), now },
      );
    } else if (booking.status !== "CANCELLED") {
      await tx.serviceBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", holdExpiresAt: null } });
      await releaseSeat(tx, booking.slotId);
    }
  }
  return visits;
}

/**
 * Repeat weekly: opens next week's round (once; repeatOfRoundId is unique) with the same service,
 * a week later. Each flat that ticked "keep my slot" gets the same time held for 24 hours, filled
 * in with last week's order. With auto-pay on and enough in the wallet it's booked straight away;
 * otherwise the resident is asked to confirm and pay. A kept slot that is gone or full is skipped.
 */
async function openNextWeek(tx: Tx, round: FinalizeRound, now: Date): Promise<{ nextRoundId: string | null; held: number; autoPaid: number }> {
  const none = { nextRoundId: null, held: 0, autoPaid: 0 };
  if (!round.serviceId) return none;
  const existing = await tx.orderRound.findUnique({ where: { repeatOfRoundId: round.id }, select: { id: true } });
  if (existing) return { ...none, nextRoundId: existing.id };

  const opened = await openRoundInTx(
    tx,
    { id: round.createdById, role: "CAPTAIN", communityId: round.communityId },
    round.communityId,
    {
      kind: "SERVICE",
      round: {
        serviceId: round.serviceId,
        title: round.title,
        cutoffAt: oneWeekLater(round.cutoffAt),
        days: nextWeekDays(round.slots.map((s) => s.startsAt)),
        repeatWeekly: true,
        repeatOfRoundId: round.id,
      },
    },
    now,
  );
  if (!opened.ok) {
    console.warn(`[milkar] couldn't open next week's "${round.title}": ${opened.errors.join(", ")}`);
    return none;
  }
  const nextRoundId = opened.roundId;

  // Bookings as they were at cutoff: flats that had units and asked to keep their slot.
  const flatsWithUnits = new Set(round.offerings.flatMap((o) => o.orderItems.filter((i) => i.quantity > 0).map((i) => i.flatId)));
  const keepers = round.bookings.filter((b) => b.status === "ACTIVE" && b.keepSlotWeekly && flatsWithUnits.has(b.flatId));
  const nextSlots = await tx.serviceSlot.findMany({ where: { roundId: nextRoundId } });
  const plans = planHolds(
    keepers.map((b) => ({ bookingId: b.id, slotStartsAt: b.slot.startsAt })),
    nextSlots,
  );

  const service = round.service?.name ?? round.title;
  const href = `/round/${nextRoundId}`;
  let held = 0;
  let autoPaid = 0;
  for (const plan of plans) {
    const previous = keepers.find((b) => b.id === plan.bookingId)!;
    const slot = nextSlots.find((s) => s.id === plan.slotId)!;
    if (!(await takeSeat(tx, slot.id))) continue;
    const hold = await tx.serviceBooking.create({
      data: {
        roundId: nextRoundId,
        flatId: previous.flatId,
        slotId: slot.id,
        userId: previous.userId,
        status: "HELD",
        holdExpiresAt: holdExpiresAt(now),
        keepSlotWeekly: true,
        autoPayFromWallet: previous.autoPayFromWallet,
        repeatOfBookingId: previous.id,
        createdAt: now,
      },
    });
    const paid = previous.autoPayFromWallet ? await autoPayHoldIn(tx, hold.id, now) : null;
    if (paid?.status === "PAID") {
      autoPaid++;
      await notify(
        tx,
        [previous.userId],
        { type: "SLOT_AUTO_BOOKED", params: { service, startsAt: slot.startsAt.toISOString(), amountPaise: paid.paidPaise }, href },
        { dedupeKey: notificationKeys.slotAutoBooked(hold.id), now },
      );
    } else {
      held++;
      await notify(
        tx,
        [previous.userId],
        { type: "SLOT_HELD", params: { service, startsAt: slot.startsAt.toISOString(), expiresAt: hold.holdExpiresAt!.toISOString() }, href },
        { dedupeKey: notificationKeys.slotHeld(hold.id), now },
      );
    }
  }
  return { nextRoundId, held, autoPaid };
}

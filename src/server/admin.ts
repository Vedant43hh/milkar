import "server-only";
import { BUY_CATEGORIES, buyCategoryOf } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { communityImpact, countTrips } from "@/lib/impact";
import { notificationKeys } from "@/lib/notifications";
import { payoutBlocker, type NotReady } from "@/lib/admin/payouts";
import { checkSettings, impactAssumptionsOf, type PlatformSettings, type SettingsProblem } from "@/lib/admin/settings";
import { platformStats } from "@/lib/admin/stats";
import { ISSUE_WINDOW_MS } from "@/lib/services/issues";
import { utcToIstDate } from "@/lib/time";
import { vendorPayout } from "@/lib/vendor/payout";
import { isUniqueViolation } from "./db-errors";
import { listIssues } from "./issues";
import { notify } from "./notifications";
import type { Actor } from "./rounds";
import { loadPlatformSettings } from "./settings";

export { loadPlatformSettings };

// The platform admin's work: settings, other admins, disputes, payouts and the numbers.

/** Margin and freeze apply to rounds opened from now on: each round keeps the values it opened with. */
export async function savePlatformSettings(actor: Actor, settings: PlatformSettings): Promise<{ ok: true } | { ok: false; errors: (SettingsProblem | "FORBIDDEN")[] }> {
  if (actor.role !== "ADMIN") return { ok: false, errors: ["FORBIDDEN"] };
  const problems = checkSettings(settings);
  if (problems.length > 0) return { ok: false, errors: problems };
  await prisma.platformSetting.upsert({ where: { id: 1 }, create: { id: 1, ...settings, updatedById: actor.id }, update: { ...settings, updatedById: actor.id } });
  return { ok: true };
}

// ---------- admins ----------

export async function listAdmins() {
  return prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, phone: true, createdAt: true } });
}

export type CreateAdminError = "FORBIDDEN" | "INVALID_NAME" | "ALREADY_REGISTERED";

/** The only way an admin account comes to exist (besides the seed): another admin adds it. */
export async function createAdmin(actor: Actor, input: { name: string; phone: string }, now: Date): Promise<{ ok: true; userId: string } | { ok: false; error: CreateAdminError }> {
  if (actor.role !== "ADMIN") return { ok: false, error: "FORBIDDEN" };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return { ok: false, error: "INVALID_NAME" };
  try {
    const user = await prisma.user.create({ data: { phone: input.phone, name, role: "ADMIN", createdAt: now } });
    return { ok: true, userId: user.id };
  } catch (error) {
    if (isUniqueViolation(error, "phone")) return { ok: false, error: "ALREADY_REGISTERED" };
    throw error;
  }
}

// ---------- disputes ----------

/**
 * What needs the admin: every disputed no-access fee, and complaints a Society Manager has left
 * open for more than 48 hours.
 */
export async function listDisputes(now: Date) {
  const stale = new Date(now.getTime() - ISSUE_WINDOW_MS);
  return listIssues({ status: "OPEN", OR: [{ kind: "NO_ACCESS_DISPUTE" }, { createdAt: { lte: stale } }] });
}

// ---------- payouts ----------

const payoutSelect = {
  id: true,
  number: true,
  status: true,
  totalPaise: true,
  paidAt: true,
  vendor: { select: { name: true } },
  adjustments: { select: { type: true, amountPaise: true } },
  round: {
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      community: { select: { name: true } },
      visits: { select: { status: true, completedAt: true, noAccessAt: true } },
      _count: { select: { serviceIssues: { where: { status: { in: ["OPEN", "REVISIT_SCHEDULED"] as ("OPEN" | "REVISIT_SCHEDULED")[] } } } } },
    },
  },
} as const;

type PayoutRow = Awaited<ReturnType<typeof payoutRows>>[number];
const payoutRows = (where: object, take?: number) =>
  prisma.vendorOrder.findMany({ where, orderBy: [{ createdAt: "asc" }], take, select: payoutSelect });

function describePayout(o: PayoutRow, now: Date) {
  const { visits, _count, ...round } = o.round;
  return {
    ...o,
    round,
    payout: vendorPayout(o),
    blocker:
      o.status === "PAID"
        ? null
        : payoutBlocker({ kind: round.kind, status: round.status, visits: visits.map((v) => ({ status: v.status, endedAt: v.completedAt ?? v.noAccessAt })), openIssues: _count.serviceIssues }, now),
  };
}

/** Orders still to pay (ready ones first), and the latest paid. */
export async function listPayouts(now: Date) {
  const [unpaid, paid] = await Promise.all([payoutRows({ status: { not: "PAID" } }), prisma.vendorOrder.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 10, select: payoutSelect })]);
  const rows = unpaid.map((o) => describePayout(o, now));
  return { ready: rows.filter((r) => r.blocker === null), waiting: rows.filter((r) => r.blocker !== null), paid: paid.map((o) => describePayout(o, now)) };
}

export type MarkPaidError = "FORBIDDEN" | "NOT_FOUND" | "ALREADY_PAID" | NotReady;

/** Records that Milkar paid the vendor what the order came to, and tells them. Once only. */
export async function markPayoutPaid(actor: Actor, orderId: string, now: Date): Promise<{ ok: true; amountPaise: number } | { ok: false; error: MarkPaidError }> {
  if (actor.role !== "ADMIN") return { ok: false, error: "FORBIDDEN" };
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "VendorOrder" WHERE id = ${orderId} FOR UPDATE`;
    if (locked.length === 0) return { ok: false, error: "NOT_FOUND" } as const;
    const order = describePayout(await tx.vendorOrder.findUniqueOrThrow({ where: { id: orderId }, select: payoutSelect }), now);
    if (order.status === "PAID") return { ok: false, error: "ALREADY_PAID" } as const;
    if (order.blocker) return { ok: false, error: order.blocker } as const;
    const current = await tx.vendorOrder.findUniqueOrThrow({ where: { id: orderId }, select: { acknowledgedAt: true, vendorId: true } });
    await tx.vendorOrder.update({ where: { id: orderId }, data: { status: "PAID", paidAt: now, paidById: actor.id, acknowledgedAt: current.acknowledgedAt ?? now } });
    const owners = await tx.user.findMany({ where: { vendorId: current.vendorId, role: "VENDOR" }, select: { id: true } });
    await notify(
      tx,
      owners.map((u) => u.id),
      { type: "PAYOUT_PAID", params: { amountPaise: order.payout.payoutPaise, round: order.round.title }, href: `/vendor/orders/${orderId}` },
      { dedupeKey: notificationKeys.payoutPaid(orderId), now },
    );
    return { ok: true, amountPaise: order.payout.payoutPaise } as const;
  });
}

// ---------- numbers ----------

/** Every vertical's money, refunds, visits, ratings and polls, plus the platform's impact estimate. */
export async function adminStats() {
  const [rounds, items, refunds, visits, ratings, polls, settings] = await Promise.all([
    prisma.orderRound.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true, kind: true, repeatWeekly: true, status: true, service: { select: { category: true } } } }),
    prisma.orderItem.findMany({
      where: { status: "CONFIRMED", quantity: { gt: 0 } },
      select: { roundId: true, flatId: true, quantity: true, finalPaise: true, absorbedPaise: true, offering: { select: { mrpPaise: true, gstBps: true, finalVendorPricePaise: true, vendorId: true } } },
    }),
    prisma.walletTransaction.findMany({ where: { amountPaise: { gt: 0 } }, select: { type: true, amountPaise: true, roundId: true } }),
    prisma.serviceVisit.findMany({ select: { roundId: true, status: true, startsAt: true } }),
    prisma.visitRating.findMany({ select: { rating: true, visit: { select: { roundId: true } } } }),
    prisma.interestPoll.findMany({ select: { status: true } }),
    loadPlatformSettings(),
  ]);
  const vertical = new Map(rounds.map((r) => [r.id, buyCategoryOf({ kind: r.kind, repeatWeekly: r.repeatWeekly, serviceCategory: r.service?.category })]));
  const status = new Map(rounds.map((r) => [r.id, r]));
  const known = items.filter((i) => vertical.has(i.roundId));
  const stats = platformStats(
    {
      rounds: rounds.map((r) => ({ vertical: vertical.get(r.id)! })),
      items: known.map((i) => ({
        vertical: vertical.get(i.roundId)!,
        quantity: i.quantity,
        finalPaise: i.finalPaise ?? 0,
        mrpPaise: i.offering.mrpPaise,
        gstBps: i.offering.gstBps,
        vendorUnitPaise: i.offering.finalVendorPricePaise ?? 0,
        absorbedPaise: i.absorbedPaise ?? 0,
      })),
      refunds: refunds.map((r) => ({ vertical: (r.roundId && vertical.get(r.roundId)) || null, type: r.type, amountPaise: r.amountPaise })),
      visits: visits.filter((v) => vertical.has(v.roundId)).map((v) => ({ vertical: vertical.get(v.roundId)!, status: v.status })),
      ratings: ratings.filter((r) => vertical.has(r.visit.roundId)).map((r) => ({ vertical: vertical.get(r.visit.roundId)!, stars: r.rating })),
      polls,
    },
    BUY_CATEGORIES,
  );
  const deliveries = known.filter((i) => status.get(i.roundId)?.kind === "GROCERY" && status.get(i.roundId)?.status === "COMPLETED").map((i) => ({ roundId: i.roundId, flatId: i.flatId, vendorId: i.offering.vendorId }));
  const trips = countTrips(
    deliveries,
    visits.filter((v) => v.status === "COMPLETED").map((v) => ({ roundId: v.roundId, day: utcToIstDate(v.startsAt) })),
  );
  return { stats, impact: communityImpact({ savedPaise: stats.total.savedPaise, trips }, impactAssumptionsOf(settings)) };
}

/** Counts for the overview. */
export async function adminHome(now: Date) {
  const [communities, vendors, disputes, payouts] = await Promise.all([
    prisma.community.count({ where: { status: "PENDING" } }),
    prisma.vendor.count({ where: { verificationStatus: "PENDING" } }),
    listDisputes(now),
    listPayouts(now),
  ]);
  return { communities, vendors, disputes: disputes.length, payoutsReady: payouts.ready.length, payoutsReadyPaise: payouts.ready.reduce((s, p) => s + p.payout.payoutPaise, 0) };
}

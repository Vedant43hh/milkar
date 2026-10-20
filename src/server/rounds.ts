import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { canManageCommunity, type Role } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { productGroupKey, serviceGroupKey } from "@/lib/pricing/basis";
import { sortTiers, validateTiers, type Tier } from "@/lib/pricing/tiers";
import {
  isTakingOrders,
  MAX_PER_FLAT_LIMIT,
  validateExtension,
  validateGroceryTimes,
  validateServiceTimes,
  type ExtensionError,
  type RoundTimeError,
} from "@/lib/rounds";
import { generateSlots, type SlotDraft } from "@/lib/services/slots";
import type { SessionUser } from "@/server/session";
import { notify } from "./notifications";
import { lockRound } from "./round-lock";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

/** Who is acting, and the community they belong to (captains act for their own community). */
export type Actor = { id: string; role: Role; communityId: string | null };

export function actorOf(user: SessionUser): Actor {
  return { id: user.id, role: user.role, communityId: user.flat?.community.id ?? null };
}

async function platformSettings(db: Db) {
  const s = await db.platformSetting.findUnique({ where: { id: 1 } });
  return { marginBps: s?.marginBps ?? 300, reductionFreezeMinutes: s?.reductionFreezeMinutes ?? 720 };
}

/** Margin and freeze that a round opened now would snapshot. */
export function currentSettings() {
  return platformSettings(prisma);
}

/** Residents (and captains) living in a community. */
export async function communityResidentIds(db: Db, communityId: string): Promise<string[]> {
  const users = await db.user.findMany({ where: { flat: { communityId }, role: { in: ["RESIDENT", "CAPTAIN"] } }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function communityCaptainIds(db: Db, communityId: string): Promise<string[]> {
  const users = await db.user.findMany({ where: { flat: { communityId }, role: "CAPTAIN" }, select: { id: true } });
  return users.map((u) => u.id);
}

function snapshotTiers(tiers: Tier[]): Prisma.InputJsonValue {
  const problems = validateTiers(tiers);
  if (problems.length > 0) throw new Error(`Invalid price tiers: ${problems.join(" ")}`);
  return sortTiers(tiers) as unknown as Prisma.InputJsonValue;
}

async function announceRound(tx: Tx, round: { id: string; title: string; communityId: string; cutoffAt: Date }, now: Date) {
  await notify(
    tx,
    await communityResidentIds(tx, round.communityId),
    { type: "ROUND_OPENED", params: { round: round.title, cutoffAt: round.cutoffAt.toISOString() }, href: `/round/${round.id}` },
    { dedupeKey: notificationKeys.roundOpened(round.id), now },
  );
}

export type CreateRoundError =
  | RoundTimeError
  | "FORBIDDEN"
  | "INVALID_TITLE"
  | "NO_PRODUCTS"
  | "UNKNOWN_PRODUCT"
  | "INVALID_CAP"
  | "UNKNOWN_SERVICE"
  | "SERVICE_NOT_READY";

export type CreateRoundResult = { ok: true; roundId: string } | { ok: false; errors: CreateRoundError[] };

function titleError(title: string): CreateRoundError[] {
  const length = title.trim().length;
  return length >= 3 && length <= 80 ? [] : ["INVALID_TITLE"];
}

function communityOf(actor: Actor): string | null {
  return actor.communityId && canManageCommunity(actor, actor.communityId) ? actor.communityId : null;
}

// ---------- grocery rounds ----------

export type GroceryRoundInput = {
  title: string;
  cutoffAt: Date;
  deliveryAt: Date;
  requirePickupCode: boolean;
  products: { productId: string; maxQtyPerFlat: number }[];
};

type GroceryPlan = {
  input: GroceryRoundInput;
  products: Prisma.ProductGetPayload<{ include: { tiers: true } }>[];
};

async function planGroceryRound(db: Db, input: GroceryRoundInput, now: Date): Promise<{ ok: true; plan: GroceryPlan } | { ok: false; errors: CreateRoundError[] }> {
  const errors: CreateRoundError[] = [...titleError(input.title), ...validateGroceryTimes({ cutoffAt: input.cutoffAt, deliveryAt: input.deliveryAt, now })];
  const ids = [...new Set(input.products.map((p) => p.productId))];
  if (ids.length === 0) errors.push("NO_PRODUCTS");
  if (input.products.some((p) => !Number.isSafeInteger(p.maxQtyPerFlat) || p.maxQtyPerFlat < 1 || p.maxQtyPerFlat > MAX_PER_FLAT_LIMIT)) {
    errors.push("INVALID_CAP");
  }
  const products = ids.length ? await db.product.findMany({ where: { id: { in: ids }, active: true }, include: { tiers: true } }) : [];
  if (products.length !== ids.length) errors.push("UNKNOWN_PRODUCT");
  return errors.length ? { ok: false, errors } : { ok: true, plan: { input, products } };
}

async function insertGroceryRound(tx: Tx, actor: Actor, communityId: string, plan: GroceryPlan, now: Date): Promise<string> {
  const { input } = plan;
  const settings = await platformSettings(tx);
  const caps = new Map(input.products.map((p) => [p.productId, p.maxQtyPerFlat]));
  const round = await tx.orderRound.create({
    data: {
      communityId,
      createdById: actor.id,
      kind: "GROCERY",
      title: input.title.trim(),
      cutoffAt: input.cutoffAt,
      deliveryAt: input.deliveryAt,
      requirePickupCode: input.requirePickupCode,
      ...settings,
      createdAt: now,
    },
  });
  await tx.roundOffering.createMany({
    data: plan.products.map((p) => ({
      roundId: round.id,
      kind: "PRODUCT" as const,
      productId: p.id,
      vendorId: p.vendorId,
      tierGroupKey: productGroupKey(p.id),
      tierBasis: "UNITS" as const,
      tiers: snapshotTiers(p.tiers.map((t) => ({ minQty: t.minQty, vendorPricePaise: t.vendorPricePaise }))),
      gstBps: p.gstBps,
      mrpPaise: p.mrpPaise,
      minOrderQty: p.minOrderQty,
      maxQtyPerFlat: caps.get(p.id) ?? p.defaultMaxPerFlat,
    })),
  });
  await announceRound(tx, round, now);
  return round.id;
}

/** Opens a grocery round with the chosen products, prices snapshotted from the catalogue. */
export async function createGroceryRound(actor: Actor, input: GroceryRoundInput, now: Date): Promise<CreateRoundResult> {
  const communityId = communityOf(actor);
  if (!communityId) return { ok: false, errors: ["FORBIDDEN"] };
  const planned = await planGroceryRound(prisma, input, now);
  if (!planned.ok) return planned;
  const roundId = await prisma.$transaction((tx) => insertGroceryRound(tx, actor, communityId, planned.plan, now));
  return { ok: true, roundId };
}

// ---------- Service Days ----------

export type ServiceRoundInput = {
  serviceId: string;
  title: string;
  cutoffAt: Date;
  /** IST day starts of the Service Day(s). */
  days: Date[];
  repeatWeekly: boolean;
};

type ServicePlan = {
  input: ServiceRoundInput;
  service: Prisma.ServiceGetPayload<{ include: { options: { include: { tiers: true } }; slotTemplates: true } }>;
  slots: SlotDraft[];
};

async function planServiceRound(db: Db, input: ServiceRoundInput, now: Date): Promise<{ ok: true; plan: ServicePlan } | { ok: false; errors: CreateRoundError[] }> {
  const errors: CreateRoundError[] = titleError(input.title);
  const service = await db.service.findFirst({
    where: { id: input.serviceId, active: true },
    include: { options: { where: { active: true }, include: { tiers: true }, orderBy: { sortOrder: "asc" } }, slotTemplates: true },
  });
  if (!service) return { ok: false, errors: [...errors, "UNKNOWN_SERVICE"] };
  if (service.options.length === 0 || service.slotTemplates.length === 0) return { ok: false, errors: [...errors, "SERVICE_NOT_READY"] };
  const slots = generateSlots(service.slotTemplates, input.days);
  errors.push(...validateServiceTimes({ cutoffAt: input.cutoffAt, days: input.days, firstSlotAt: slots[0]?.startsAt ?? null, now }));
  return errors.length ? { ok: false, errors } : { ok: true, plan: { input, service, slots } };
}

async function insertServiceRound(tx: Tx, actor: Actor, communityId: string, plan: ServicePlan, now: Date): Promise<string> {
  const { input, service, slots } = plan;
  const settings = await platformSettings(tx);
  const round = await tx.orderRound.create({
    data: {
      communityId,
      createdById: actor.id,
      kind: "SERVICE",
      title: input.title.trim(),
      cutoffAt: input.cutoffAt,
      deliveryAt: slots[0].startsAt,
      requirePickupCode: false,
      serviceId: service.id,
      vendorId: service.vendorId,
      noAccessFeePaise: service.noAccessFeePaise,
      repeatWeekly: input.repeatWeekly,
      ...settings,
      createdAt: now,
    },
  });
  await tx.roundOffering.createMany({
    data: service.options.map((o) => ({
      roundId: round.id,
      kind: "SERVICE_OPTION" as const,
      serviceOptionId: o.id,
      vendorId: service.vendorId,
      tierGroupKey: serviceGroupKey(service.id),
      tierBasis: "FLATS" as const,
      unitLabel: o.unitLabel,
      tiers: snapshotTiers(o.tiers.map((t) => ({ minQty: t.minFlats, vendorPricePaise: t.vendorPricePaise }))),
      gstBps: service.gstBps,
      mrpPaise: o.mrpPaise,
      minOrderQty: service.minFlats,
      maxQtyPerFlat: o.maxPerFlat,
    })),
  });
  await tx.serviceSlot.createMany({ data: slots.map((s) => ({ roundId: round.id, ...s })) });
  await announceRound(tx, round, now);
  return round.id;
}

/** Opens a Service Day: one offering per service option, slots from the vendor's templates. */
export async function createServiceRound(actor: Actor, input: ServiceRoundInput, now: Date): Promise<CreateRoundResult> {
  const communityId = communityOf(actor);
  if (!communityId) return { ok: false, errors: ["FORBIDDEN"] };
  const planned = await planServiceRound(prisma, input, now);
  if (!planned.ok) return planned;
  const roundId = await prisma.$transaction((tx) => insertServiceRound(tx, actor, communityId, planned.plan, now));
  return { ok: true, roundId };
}

/** For one-tap rounds from a poll, inside the caller's transaction. */
export async function openRoundInTx(
  tx: Tx,
  actor: Actor,
  communityId: string,
  input: { kind: "SERVICE"; round: ServiceRoundInput } | { kind: "GROCERY"; round: GroceryRoundInput },
  now: Date,
): Promise<CreateRoundResult> {
  if (input.kind === "SERVICE") {
    const planned = await planServiceRound(tx, input.round, now);
    return planned.ok ? { ok: true, roundId: await insertServiceRound(tx, actor, communityId, planned.plan, now) } : planned;
  }
  const planned = await planGroceryRound(tx, input.round, now);
  return planned.ok ? { ok: true, roundId: await insertGroceryRound(tx, actor, communityId, planned.plan, now) } : planned;
}

// ---------- running a round ----------

export type RoundActionError = ExtensionError | "NOT_FOUND" | "FORBIDDEN";
export type RoundActionResult = { ok: true } | { ok: false; error: RoundActionError };

type LockedRound = Prisma.OrderRoundGetPayload<{ include: { slots: { select: { startsAt: true } } } }>;

/** Locks the round and checks the actor may manage it. */
async function lockedRound(tx: Tx, actor: Actor, roundId: string): Promise<{ round: LockedRound; error?: never } | { round?: never; error: "NOT_FOUND" | "FORBIDDEN" }> {
  if (!(await lockRound(tx, roundId))) return { error: "NOT_FOUND" };
  const round = await tx.orderRound.findUniqueOrThrow({
    where: { id: roundId },
    include: { slots: { orderBy: { startsAt: "asc" }, take: 1, select: { startsAt: true } } },
  });
  if (!canManageCommunity(actor, round.communityId)) return { error: "FORBIDDEN" };
  return { round };
}

export async function extendCutoff(actor: Actor, roundId: string, newCutoffAt: Date, now: Date): Promise<RoundActionResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockedRound(tx, actor, roundId);
    if (locked.error) return { ok: false, error: locked.error };
    const { round } = locked;
    const mustCloseBefore = round.kind === "SERVICE" ? (round.slots[0]?.startsAt ?? round.deliveryAt) : round.deliveryAt;
    const error = validateExtension({ round, newCutoffAt, now, mustCloseBefore });
    if (error) return { ok: false, error };
    await tx.orderRound.update({ where: { id: roundId }, data: { cutoffAt: newCutoffAt, version: { increment: 1 } } });
    return { ok: true };
  });
}

/** Stops taking orders now. The cutoff job then finalizes the round as usual. */
export async function closeRoundNow(actor: Actor, roundId: string, now: Date): Promise<RoundActionResult> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockedRound(tx, actor, roundId);
    if (locked.error) return { ok: false, error: locked.error };
    if (!isTakingOrders(locked.round, now)) return { ok: false, error: "ROUND_CLOSED" };
    await tx.orderRound.update({ where: { id: roundId }, data: { cutoffAt: now, version: { increment: 1 } } });
    return { ok: true };
  });
}

export const roundCancelRefundKey = (orderItemId: string) => `ROUND_CANCEL_REFUND:${orderItemId}`;

/**
 * Cancels a round that hasn't been finalized: every resident gets back exactly what they paid
 * (wallet credit, one idempotent entry per order item), bookings and holds are released, and
 * unpaid quotes stop working. Runs under the round lock, so no checkout can slip in between.
 */
export async function cancelRound(actor: Actor, roundId: string, reason: string, now: Date): Promise<RoundActionResult & { refundedPaise?: number }> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockedRound(tx, actor, roundId);
    if (locked.error) return { ok: false, error: locked.error };
    const { round } = locked;
    if (round.status !== "OPEN") return { ok: false, error: "ROUND_CLOSED" };

    const items = await tx.orderItem.findMany({ where: { roundId, chargedPaise: { gt: 0 } }, select: { id: true, userId: true, chargedPaise: true } });
    await tx.walletTransaction.createMany({
      data: items.map((i) => ({
        userId: i.userId,
        amountPaise: i.chargedPaise,
        type: "ROUND_CANCEL_REFUND" as const,
        roundId,
        orderItemId: i.id,
        idempotencyKey: roundCancelRefundKey(i.id),
        note: reason || null,
        createdAt: now,
      })),
      skipDuplicates: true,
    });
    for (const i of items) {
      await tx.orderItem.update({ where: { id: i.id }, data: { status: "CANCELLED", finalPaise: 0, refundPaise: i.chargedPaise, absorbedPaise: 0 } });
    }
    await tx.orderItem.updateMany({ where: { roundId, status: "ACTIVE" }, data: { status: "CANCELLED" } });
    await tx.serviceBooking.updateMany({ where: { roundId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } });
    await tx.serviceSlot.updateMany({ where: { roundId }, data: { bookedCount: 0 } });
    await tx.payment.updateMany({ where: { roundId, status: "CREATED" }, data: { status: "EXPIRED", failureReason: "Round cancelled" } });
    await tx.orderRound.update({
      where: { id: roundId },
      data: { status: "CANCELLED", cancelledAt: now, cancelReason: reason || null, version: { increment: 1 } },
    });

    const perUser = new Map<string, number>();
    for (const i of items) perUser.set(i.userId, (perUser.get(i.userId) ?? 0) + i.chargedPaise);
    for (const [userId, amountPaise] of perUser) {
      await notify(
        tx,
        [userId],
        { type: "REFUND_CREDITED", params: { amountPaise, reason: "ROUND_CANCEL_REFUND", round: round.title }, href: "/wallet" },
        { dedupeKey: notificationKeys.refund(`ROUND_CANCEL_REFUND:${roundId}`), now },
      );
    }
    return { ok: true, refundedPaise: items.reduce((s, i) => s + i.chargedPaise, 0) };
  });
}

// ---------- reading ----------

const offeringInclude = {
  product: { select: { name: true, unit: true, packSize: true, category: true } },
  serviceOption: { select: { name: true, sortOrder: true } },
  vendor: { select: { name: true } },
  orderItems: { select: { flatId: true, quantity: true, chargedPaise: true } },
} satisfies Prisma.RoundOfferingInclude;

/** Rounds for the captain's lists, newest first. */
export async function listCommunityRounds(communityId: string) {
  return prisma.orderRound.findMany({
    where: { communityId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      service: { select: { name: true } },
      vendor: { select: { name: true } },
      offerings: { include: offeringInclude },
    },
  });
}

export type CaptainRound = Awaited<ReturnType<typeof listCommunityRounds>>[number];

/** Everything the round dashboard shows, or null if the round isn't the actor's to manage. */
export async function getRoundDashboard(actor: Actor, roundId: string) {
  const round = await prisma.orderRound.findUnique({
    where: { id: roundId },
    include: {
      community: { select: { name: true, code: true, unitLabel: true } },
      service: { select: { name: true, durationMinutes: true, vendor: { select: { name: true, verificationStatus: true } } } },
      vendor: { select: { name: true } },
      offerings: { include: offeringInclude },
      slots: { orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, endsAt: true, capacity: true, bookedCount: true } },
      bookings: { where: { status: "HELD" }, select: { id: true } },
      fromPoll: { select: { id: true, title: true } },
    },
  });
  if (!round || !canManageCommunity(actor, round.communityId)) return null;
  const recent = await prisma.payment.findMany({
    where: { roundId, status: "PAID" },
    orderBy: { paidAt: "desc" },
    take: 8,
    select: {
      id: true,
      paidAt: true,
      chargePaise: true,
      creditPaise: true,
      user: { select: { name: true, flat: { select: { tower: true, number: true } } } },
    },
  });
  return { round, recent };
}

export type RoundDashboard = NonNullable<Awaited<ReturnType<typeof getRoundDashboard>>>;

/** Products a captain can put in a grocery round, with their tiers, grouped by the caller. */
export async function listCatalogue() {
  return prisma.product.findMany({
    where: { active: true, vendor: { active: true } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { tiers: { orderBy: { minQty: "asc" } }, vendor: { select: { name: true } } },
  });
}

/** Services a captain can run a Service Day for. */
export async function listServices() {
  return prisma.service.findMany({
    where: { active: true, vendor: { active: true } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      vendor: { select: { name: true, verificationStatus: true, ratingCount: true, ratingSum: true } },
      options: { where: { active: true }, orderBy: { sortOrder: "asc" }, include: { tiers: { orderBy: { minFlats: "asc" } } } },
      slotTemplates: { orderBy: { startTime: "asc" } },
    },
  });
}

export type CatalogueService = Awaited<ReturnType<typeof listServices>>[number];

// Simulation engine for the seed. Orders, cutoffs and visits are processed on one timeline in time
// order, through the same pure pricing code the app uses, so wallets, tier unlocks, refunds and
// notifications are all consistent with each other.
import { randomUUID } from "node:crypto";
import type { Prisma } from "../src/generated/prisma/client";
import { notificationKeys, type NotificationMessage, type NotificationType } from "../src/lib/notifications";
import { groupBasis, type TierBasis } from "../src/lib/pricing/basis";
import { applyQuoteLine, quoteChanges, type IdLot, type Quote, type QuoteOffering } from "../src/lib/pricing/checkout";
import { buildVendorOrders, type ConfirmedOffering } from "../src/lib/pricing/consolidate";
import { computeFinalization, type FinalizeResult } from "../src/lib/pricing/finalize";
import { lotsQty, lotsTotal } from "../src/lib/pricing/lots";
import { unitPrice, unitPriceAt, vendorPriceForTotal } from "../src/lib/pricing/price";
import { QUOTE_TTL_MS } from "../src/lib/pricing/rules";
import { tierIndexAt, type Tier } from "../src/lib/pricing/tiers";

export const MARGIN_BPS = 300;
export const FREEZE_MINUTES = 720;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const id = () => randomUUID();
export const json = (value: unknown) => value as Prisma.InputJsonValue;
export const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);

// ---------- deterministic randomness ----------
export function createRandom(seed: number) {
  let a = seed;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]) => items[int(0, items.length - 1)],
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    between: (from: Date, to: Date) => new Date(from.getTime() + Math.floor(next() * (to.getTime() - from.getTime()))),
    code: () => String(int(0, 9999)).padStart(4, "0"),
  };
}
export type Random = ReturnType<typeof createRandom>;

/** Vendor price (GST-exclusive) for a resident price in rupees. Refuses prices the arithmetic can't hit exactly. */
export function exactVendorPrice(rupees: number, gstBps: number): number {
  const vendorPaise = vendorPriceForTotal(rupees * 100, MARGIN_BPS, gstBps);
  if (unitPrice(vendorPaise, MARGIN_BPS, gstBps).totalPaise !== rupees * 100) {
    throw new Error(`₹${rupees} at ${gstBps / 100}% GST can't be reached exactly with a ${MARGIN_BPS / 100}% margin; pick a nearby price`);
  }
  return vendorPaise;
}

// ---------- simulation types ----------
export type Participant = { userId: string; flatId: string; name: string };

export type SimOffering = {
  id: string;
  key: string;
  /** Shown in notifications, e.g. "Sona Masoori Rice" or "AC servicing · Split AC". */
  name: string;
  kind: "PRODUCT" | "SERVICE_OPTION";
  productId: string | null;
  serviceOptionId: string | null;
  vendorId: string;
  tierGroupKey: string;
  tierBasis: TierBasis;
  unitLabel: string | null;
  tiers: Tier[];
  gstBps: number;
  mrpPaise: number;
  minOrderQty: number;
  maxQtyPerFlat: number;
};

type SeedLot = IdLot & { createdAt: Date; paymentId: string };
type SimItem = { id: string; userId: string; flatId: string; offering: SimOffering; lots: SeedLot[]; createdAt: Date };
type Outcome = { status: "CONFIRMED" | "DROPPED"; finalPaise: number; refundPaise: number; absorbedPaise: number };

export type SimSlot = { id: string; startsAt: Date; endsAt: Date; capacity: number; booked: number };
export type SimBooking = {
  id: string;
  flatId: string;
  userId: string;
  slot: SimSlot;
  status: "HELD" | "ACTIVE";
  keepSlotWeekly: boolean;
  autoPayFromWallet: boolean;
};

export type SimRound = {
  id: string;
  kind: "GROCERY" | "SERVICE";
  title: string;
  communityId: string;
  cutoffAt: Date;
  deliveryAt: Date;
  offerings: SimOffering[];
  items: Map<string, SimItem>;
  outcomes: Map<string, Outcome>;
  finalUnit: Map<string, number>;
  slots: SimSlot[];
  bookings: Map<string, SimBooking>;
  record: Prisma.OrderRoundCreateManyInput;
  href: string;
};

export type OrderEvent = {
  round: SimRound;
  userId: string;
  flatId: string;
  at: Date;
  /** offeringId → quantity the resident ends up with */
  targets: Record<string, number>;
  /** Service rounds: the slot the flat books with its first order. */
  booking?: { slot: SimSlot; keepSlotWeekly?: boolean; autoPayFromWallet?: boolean; status?: "ACTIVE" };
};

function emptyRecords() {
  return {
    communities: [] as Prisma.CommunityCreateManyInput[],
    flats: [] as Prisma.FlatCreateManyInput[],
    vendors: [] as Prisma.VendorCreateManyInput[],
    users: [] as Prisma.UserCreateManyInput[],
    communityStaff: [] as Prisma.CommunityStaffCreateManyInput[],
    products: [] as Prisma.ProductCreateManyInput[],
    priceTiers: [] as Prisma.PriceTierCreateManyInput[],
    services: [] as Prisma.ServiceCreateManyInput[],
    serviceOptions: [] as Prisma.ServiceOptionCreateManyInput[],
    optionTiers: [] as Prisma.ServiceOptionTierCreateManyInput[],
    slotTemplates: [] as Prisma.VendorSlotTemplateCreateManyInput[],
    rounds: [] as Prisma.OrderRoundCreateManyInput[],
    offerings: [] as Prisma.RoundOfferingCreateManyInput[],
    slots: [] as Prisma.ServiceSlotCreateManyInput[],
    bookings: [] as Prisma.ServiceBookingCreateManyInput[],
    payments: [] as Prisma.PaymentCreateManyInput[],
    orderItems: [] as Prisma.OrderItemCreateManyInput[],
    lots: [] as Prisma.OrderLotCreateManyInput[],
    walletTxns: [] as Prisma.WalletTransactionCreateManyInput[],
    vendorOrders: [] as Prisma.VendorOrderCreateManyInput[],
    vendorOrderLines: [] as Prisma.VendorOrderLineCreateManyInput[],
    vendorAdjustments: [] as Prisma.VendorAdjustmentCreateManyInput[],
    distribution: [] as Prisma.DistributionRecordCreateManyInput[],
    orderIssues: [] as Prisma.OrderIssueCreateManyInput[],
    visits: [] as Prisma.ServiceVisitCreateManyInput[],
    ratings: [] as Prisma.VisitRatingCreateManyInput[],
    serviceIssues: [] as Prisma.ServiceIssueCreateManyInput[],
    polls: [] as Prisma.InterestPollCreateManyInput[],
    votes: [] as Prisma.PollVoteCreateManyInput[],
    notifications: [] as Prisma.NotificationCreateManyInput[],
  };
}

export class SeedWorld {
  readonly rec = emptyRecords();
  readonly wallet = new Map<string, number>();
  private readonly timeline: { at: Date; seq: number; run: () => void }[] = [];
  private seq = 0;
  private lotSeq = 0;

  constructor(
    readonly now: Date,
    readonly random: Random,
  ) {}

  // ---------- timeline ----------
  /** Queues an action. Actions run in time order and may queue later actions. */
  at(when: Date, run: () => void) {
    this.timeline.push({ at: when, seq: this.seq++, run });
  }

  run() {
    while (this.timeline.length > 0) {
      let index = 0;
      for (let i = 1; i < this.timeline.length; i++) {
        const a = this.timeline[i];
        const b = this.timeline[index];
        if (a.at.getTime() < b.at.getTime() || (a.at.getTime() === b.at.getTime() && a.seq < b.seq)) index = i;
      }
      const [next] = this.timeline.splice(index, 1);
      if (next.at.getTime() > this.now.getTime()) throw new Error(`Seed action scheduled in the future (${next.at.toISOString()})`);
      next.run();
    }
  }

  // ---------- wallet and notifications ----------
  balance(userId: string): number {
    return this.wallet.get(userId) ?? 0;
  }

  credit(
    userId: string,
    amountPaise: number,
    type: Prisma.WalletTransactionCreateManyInput["type"],
    idempotencyKey: string,
    createdAt: Date,
    extra: Partial<Prisma.WalletTransactionCreateManyInput> = {},
  ) {
    if (amountPaise === 0) return;
    const balance = this.balance(userId) + amountPaise;
    if (balance < 0) throw new Error(`Wallet of ${userId} would go negative`);
    this.wallet.set(userId, balance);
    this.rec.walletTxns.push({ id: id(), userId, amountPaise, type, idempotencyKey, createdAt, ...extra });
  }

  /** Stores notifications; anything older than a day and a half counts as read. */
  notify<T extends NotificationType>(userIds: readonly string[], message: NotificationMessage<T>, when: Date, dedupeKey?: string) {
    const read = this.now.getTime() - when.getTime() > 36 * HOUR;
    for (const userId of new Set(userIds)) {
      if (dedupeKey && this.rec.notifications.some((n) => n.userId === userId && n.dedupeKey === dedupeKey)) continue;
      this.rec.notifications.push({
        id: id(),
        userId,
        type: message.type,
        params: json(message.params),
        href: message.href ?? null,
        dedupeKey: dedupeKey ?? null,
        readAt: read ? plus(when, 2 * HOUR) : null,
        createdAt: when,
      });
    }
  }

  // ---------- rounds ----------
  addRound(input: {
    kind: "GROCERY" | "SERVICE";
    title: string;
    communityId: string;
    createdById: string;
    cutoffAt: Date;
    deliveryAt: Date;
    createdAt: Date;
    offerings: Omit<SimOffering, "id">[];
    service?: { serviceId: string; vendorId: string; noAccessFeePaise: number };
    repeatWeekly?: boolean;
    repeatOfRoundId?: string;
  }): SimRound {
    const roundId = id();
    const record: Prisma.OrderRoundCreateManyInput = {
      id: roundId,
      communityId: input.communityId,
      createdById: input.createdById,
      kind: input.kind,
      title: input.title,
      status: "OPEN",
      cutoffAt: input.cutoffAt,
      deliveryAt: input.deliveryAt,
      marginBps: MARGIN_BPS,
      reductionFreezeMinutes: FREEZE_MINUTES,
      requirePickupCode: input.kind === "GROCERY",
      serviceId: input.service?.serviceId ?? null,
      vendorId: input.service?.vendorId ?? null,
      noAccessFeePaise: input.service?.noAccessFeePaise ?? null,
      repeatWeekly: input.repeatWeekly ?? false,
      repeatOfRoundId: input.repeatOfRoundId ?? null,
      createdAt: input.createdAt,
    };
    this.rec.rounds.push(record);
    const offerings = input.offerings.map((o) => ({ ...o, id: id() }));
    for (const o of offerings) {
      this.rec.offerings.push({
        id: o.id,
        roundId,
        kind: o.kind,
        productId: o.productId,
        serviceOptionId: o.serviceOptionId,
        vendorId: o.vendorId,
        tierGroupKey: o.tierGroupKey,
        tierBasis: o.tierBasis,
        unitLabel: o.unitLabel,
        tiers: json(o.tiers),
        gstBps: o.gstBps,
        mrpPaise: o.mrpPaise,
        minOrderQty: o.minOrderQty,
        maxQtyPerFlat: o.maxQtyPerFlat,
        status: "ACTIVE",
      });
    }
    const round: SimRound = {
      id: roundId,
      kind: input.kind,
      title: input.title,
      communityId: input.communityId,
      cutoffAt: input.cutoffAt,
      deliveryAt: input.deliveryAt,
      offerings,
      items: new Map(),
      outcomes: new Map(),
      finalUnit: new Map(),
      slots: [],
      bookings: new Map(),
      record,
      href: input.kind === "GROCERY" ? "/app/groceries" : `/app/services/${roundId}`,
    };
    return round;
  }

  addSlots(round: SimRound, drafts: { startsAt: Date; endsAt: Date; capacity: number }[]): SimSlot[] {
    for (const d of drafts) round.slots.push({ id: id(), ...d, booked: 0 });
    return round.slots;
  }

  offering(round: SimRound, key: string): SimOffering {
    const o = round.offerings.find((x) => x.key === key);
    if (!o) throw new Error(`Round ${round.title} has no offering ${key}`);
    return o;
  }

  private groupItems(round: SimRound, tierGroupKey: string) {
    return [...round.items.values()].filter((i) => i.offering.tierGroupKey === tierGroupKey);
  }

  basis(round: SimRound, offering: SimOffering): number {
    return groupBasis(
      this.groupItems(round, offering.tierGroupKey).map((i) => ({ flatId: i.flatId, quantity: lotsQty(i.lots) })),
      offering.tierBasis,
    );
  }

  /** Units the flat holds in a round (across family members). */
  flatUnits(round: SimRound, flatId: string): number {
    return [...round.items.values()].filter((i) => i.flatId === flatId).reduce((n, i) => n + lotsQty(i.lots), 0);
  }

  /** Prices a change exactly as checkout does and applies it: payment, lots, wallet and tier unlocks. */
  order(ev: OrderEvent): Quote {
    const { round } = ev;
    const touched = round.offerings.filter((o) => o.id in ev.targets);
    const groups = [...new Map(touched.map((o) => [o.tierGroupKey, o])).values()];
    const before = new Map(groups.map((o) => [o.tierGroupKey, this.basis(round, o)]));

    const offerings: QuoteOffering[] = touched.map((o) => ({
      offeringId: o.id,
      pricing: { tiers: o.tiers, marginBps: MARGIN_BPS, gstBps: o.gstBps },
      active: true,
      maxQtyPerFlat: o.maxQtyPerFlat,
      basisCount: before.get(o.tierGroupKey)!,
      flatOthersQty: [...round.items.values()]
        .filter((i) => i.offering.id === o.id && i.flatId === ev.flatId && i.userId !== ev.userId)
        .reduce((n, i) => n + lotsQty(i.lots), 0),
      userLots: round.items.get(`${ev.userId}:${o.id}`)?.lots ?? [],
    }));
    const result = quoteChanges({
      round: { status: "OPEN", cutoffAt: round.cutoffAt, reductionFreezeMinutes: FREEZE_MINUTES },
      now: ev.at,
      offerings,
      targets: ev.targets,
      walletBalancePaise: this.balance(ev.userId),
    });
    if (!result.ok) throw new Error(`Seed order rejected in ${round.title}: ${JSON.stringify(result.errors)}`);
    const quote = result.quote;

    if (ev.booking && !round.bookings.has(ev.flatId)) this.book(round, ev, ev.booking);

    const paymentId = id();
    const viaGateway = quote.gatewayPaise > 0;
    this.rec.payments.push({
      id: paymentId,
      userId: ev.userId,
      roundId: round.id,
      changes: json(quote),
      chargePaise: quote.chargePaise,
      creditPaise: quote.creditPaise,
      walletAppliedPaise: quote.walletAppliedPaise,
      gatewayPaise: quote.gatewayPaise,
      provider: viaGateway ? "MOCK" : "WALLET",
      providerOrderId: viaGateway ? `mock_order_${paymentId.slice(0, 8)}` : null,
      providerPaymentId: viaGateway ? `mock_pay_${paymentId.slice(0, 8)}` : null,
      status: "PAID",
      expiresAt: plus(ev.at, -2 * MINUTE + QUOTE_TTL_MS),
      paidAt: ev.at,
      createdAt: plus(ev.at, -2 * MINUTE),
    });
    for (const line of quote.lines) {
      const key = `${ev.userId}:${line.offeringId}`;
      const offering = round.offerings.find((o) => o.id === line.offeringId)!;
      const item = round.items.get(key) ?? { id: id(), userId: ev.userId, flatId: ev.flatId, offering, lots: [], createdAt: ev.at };
      item.lots = applyQuoteLine(item.lots, line, (quantity, unitPricePaise) => ({
        id: id(),
        quantity,
        unitPricePaise,
        seq: ++this.lotSeq,
        createdAt: ev.at,
        paymentId,
      }));
      round.items.set(key, item);
    }
    this.credit(ev.userId, quote.creditPaise, "CANCEL_REFUND", `CANCEL_REFUND:${paymentId}`, ev.at, { roundId: round.id, paymentId });
    this.credit(ev.userId, -quote.walletAppliedPaise, "ORDER_DEBIT", `ORDER_DEBIT:${paymentId}`, ev.at, { roundId: round.id, paymentId });

    // A better tier for the whole group: tell everyone holding units in it.
    for (const o of groups) {
      const fromIndex = tierIndexAt(o.tiers, before.get(o.tierGroupKey)!);
      const after = this.basis(round, o);
      const toIndex = tierIndexAt(o.tiers, after);
      if (toIndex <= fromIndex) continue;
      const minQty = [...o.tiers].sort((a, b) => a.minQty - b.minQty)[toIndex].minQty;
      for (const item of this.groupItems(round, o.tierGroupKey)) {
        if (lotsQty(item.lots) === 0) continue;
        this.notify(
          [item.userId],
          {
            type: "TIER_UNLOCKED",
            params: { item: item.offering.name, pricePaise: unitPriceAt({ tiers: item.offering.tiers, marginBps: MARGIN_BPS, gstBps: item.offering.gstBps }, after).totalPaise },
            href: round.href,
          },
          ev.at,
          notificationKeys.tierUnlocked(round.id, o.tierGroupKey, minQty),
        );
      }
    }
    return quote;
  }

  private book(round: SimRound, ev: OrderEvent, booking: NonNullable<OrderEvent["booking"]>) {
    const { slot } = booking;
    if (slot.booked >= slot.capacity) throw new Error(`Seed overbooked a slot in ${round.title}`);
    slot.booked++;
    round.bookings.set(ev.flatId, {
      id: id(),
      flatId: ev.flatId,
      userId: ev.userId,
      slot,
      status: "ACTIVE",
      keepSlotWeekly: booking.keepSlotWeekly ?? false,
      autoPayFromWallet: booking.autoPayFromWallet ?? false,
    });
  }

  /** A slot held from last week's booking, waiting for confirm and pay. Takes a seat like any booking. */
  hold(round: SimRound, input: { flatId: string; userId: string; slot: SimSlot; repeatOf: SimBooking }): SimBooking {
    if (input.slot.booked >= input.slot.capacity) throw new Error(`Seed overbooked a slot in ${round.title}`);
    input.slot.booked++;
    const booking: SimBooking = {
      id: id(),
      flatId: input.flatId,
      userId: input.userId,
      slot: input.slot,
      status: "HELD",
      keepSlotWeekly: input.repeatOf.keepSlotWeekly,
      autoPayFromWallet: input.repeatOf.autoPayFromWallet,
    };
    round.bookings.set(input.flatId, booking);
    return booking;
  }

  /** Cutoff: final prices, refunds and the vendor orders. Mirrors the finalize job. */
  finalize(round: SimRound, at: Date): { result: FinalizeResult; confirmed: ConfirmedOffering[] } {
    const items = [...round.items.values()];
    const result = computeFinalization({
      marginBps: MARGIN_BPS,
      offerings: round.offerings.map((o) => ({
        offeringId: o.id,
        tierGroupKey: o.tierGroupKey,
        tierBasis: o.tierBasis,
        tiers: o.tiers,
        gstBps: o.gstBps,
        minOrderQty: o.minOrderQty,
        items: items
          .filter((i) => i.offering.id === o.id)
          .map((i) => ({ orderItemId: i.id, userId: i.userId, flatId: i.flatId, lots: i.lots, chargedPaise: lotsTotal(i.lots) })),
      })),
    });

    const confirmed: ConfirmedOffering[] = [];
    const refunds = new Map<string, { amount: number; type: "TIER_REFUND" | "DROP_REFUND" }>();
    for (const f of result.offerings) {
      const offering = round.offerings.find((o) => o.id === f.offeringId)!;
      const record = this.rec.offerings.find((r) => r.id === f.offeringId)!;
      record.status = f.status;
      record.finalQty = f.totalQty;
      record.finalBasisCount = f.basisCount;
      if (f.status === "CONFIRMED" && f.tier && f.unit) {
        record.finalVendorPricePaise = f.tier.vendorPricePaise;
        record.finalUnitPricePaise = f.unit.totalPaise;
        round.finalUnit.set(f.offeringId, f.unit.totalPaise);
        confirmed.push({
          offeringId: f.offeringId,
          productId: offering.productId,
          serviceOptionId: offering.serviceOptionId,
          vendorId: offering.vendorId,
          totalQty: f.totalQty,
          vendorPricePaise: f.tier.vendorPricePaise,
          gstBps: offering.gstBps,
        });
      }
      for (const i of f.items) {
        round.outcomes.set(i.orderItemId, { status: f.status, finalPaise: i.finalPaise, refundPaise: i.refundPaise, absorbedPaise: i.absorbedPaise });
        const type = f.status === "DROPPED" ? "DROP_REFUND" : "TIER_REFUND";
        this.credit(i.userId, i.refundPaise, type, `${type}:${i.orderItemId}`, at, { roundId: round.id, orderItemId: i.orderItemId });
        if (i.refundPaise > 0) {
          const key = `${i.userId}:${type}`;
          refunds.set(key, { amount: (refunds.get(key)?.amount ?? 0) + i.refundPaise, type });
        }
      }
    }
    for (const [key, { amount, type }] of refunds) {
      const userId = key.slice(0, key.lastIndexOf(":"));
      this.notify([userId], { type: "REFUND_CREDITED", params: { amountPaise: amount, reason: type, round: round.title }, href: "/app/wallet" }, at, notificationKeys.refund(`${type}:${round.id}`));
    }
    const confirmedUsers = result.offerings.filter((f) => f.status === "CONFIRMED").flatMap((f) => f.items.map((i) => i.userId));
    this.notify(confirmedUsers, { type: "ROUND_FINALIZED", params: { round: round.title }, href: round.href }, at, notificationKeys.roundFinalized(round.id));
    round.record.status = "FINALIZED";
    round.record.finalizedAt = at;
    return { result, confirmed };
  }

  issueVendorOrders(round: SimRound, confirmed: ConfirmedOffering[], at: Date, acknowledgedAt: Date | null) {
    const orders = buildVendorOrders(confirmed).map((draft) => {
      const vendorOrderId = id();
      this.rec.vendorOrders.push({
        id: vendorOrderId,
        roundId: round.id,
        vendorId: draft.vendorId,
        status: acknowledgedAt ? "ACKNOWLEDGED" : "ISSUED",
        subtotalPaise: draft.subtotalPaise,
        gstPaise: draft.gstPaise,
        totalPaise: draft.totalPaise,
        acknowledgedAt,
        createdAt: at,
      });
      for (const line of draft.lines) this.rec.vendorOrderLines.push({ id: id(), vendorOrderId, ...line });
      return { id: vendorOrderId, ...draft };
    });
    return orders;
  }

  /** Writes every order item and lot once the timeline has run. */
  recordItems(round: SimRound, issues = new Map<string, { shortQty: number; damagedQty: number; refund: number }>()) {
    for (const item of round.items.values()) {
      const qty = lotsQty(item.lots);
      const outcome = round.outcomes.get(item.id);
      const issue = issues.get(item.id);
      this.rec.orderItems.push({
        id: item.id,
        roundId: round.id,
        offeringId: item.offering.id,
        userId: item.userId,
        flatId: item.flatId,
        quantity: qty,
        chargedPaise: lotsTotal(item.lots),
        status: outcome?.status ?? (qty === 0 ? "CANCELLED" : "ACTIVE"),
        finalPaise: outcome?.finalPaise ?? null,
        refundPaise: outcome?.refundPaise ?? null,
        absorbedPaise: outcome?.absorbedPaise ?? null,
        shortQty: issue?.shortQty ?? 0,
        damagedQty: issue?.damagedQty ?? 0,
        issueRefundPaise: issue?.refund ?? 0,
        createdAt: item.createdAt,
      });
      for (const lot of item.lots) {
        this.rec.lots.push({ id: lot.id, orderItemId: item.id, quantity: lot.quantity, unitPricePaise: lot.unitPricePaise, paymentId: lot.paymentId, createdAt: lot.createdAt });
      }
    }
    for (const slot of round.slots) {
      this.rec.slots.push({ id: slot.id, roundId: round.id, startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: slot.capacity, bookedCount: slot.booked });
    }
  }

  /** Bookings are written after their round's slots; holds point at last week's bookings. */
  recordBookings(round: SimRound, extra: Map<string, { holdExpiresAt?: Date; repeatOfBookingId?: string; createdAt: Date }>) {
    for (const b of round.bookings.values()) {
      const meta = extra.get(b.id);
      this.rec.bookings.push({
        id: b.id,
        roundId: round.id,
        flatId: b.flatId,
        slotId: b.slot.id,
        userId: b.userId,
        status: b.status,
        holdExpiresAt: meta?.holdExpiresAt ?? null,
        keepSlotWeekly: b.keepSlotWeekly,
        autoPayFromWallet: b.autoPayFromWallet,
        repeatOfBookingId: meta?.repeatOfBookingId ?? null,
        createdAt: meta?.createdAt ?? round.record.createdAt,
      });
    }
  }

  /** Items (with what was finally paid) belonging to one flat in a round. */
  flatItems(round: SimRound, flatId: string) {
    return [...round.items.values()]
      .filter((i) => i.flatId === flatId && lotsQty(i.lots) > 0)
      .map((i) => ({ item: i, outcome: round.outcomes.get(i.id) }));
  }
}

/**
 * Spreads each product's community total across participants, respecting per-flat caps.
 * `exclude` keeps a product away from some flats ("<flatId>:<product key>").
 */
export function planGroceryEvents(
  world: SeedWorld,
  round: SimRound,
  participants: Participant[],
  totals: Record<string, number>,
  from: Date,
  to: Date,
  exclude: ReadonlySet<string> = new Set(),
): OrderEvent[] {
  const { random } = world;
  const alloc = new Map<string, Map<string, number>>();
  const flatUsed = new Map<string, number>();
  for (const o of round.offerings) {
    let remaining = totals[o.key] ?? 0;
    while (remaining > 0) {
      let progressed = false;
      for (const p of random.shuffle(participants)) {
        if (remaining === 0) break;
        if (random.chance(0.3) || exclude.has(`${p.flatId}:${o.key}`)) continue;
        const flatKey = `${p.flatId}:${o.id}`;
        const room = o.maxQtyPerFlat - (flatUsed.get(flatKey) ?? 0);
        if (room <= 0) continue;
        const q = Math.min(remaining, room, random.int(1, 3));
        const mine = alloc.get(p.userId) ?? new Map<string, number>();
        mine.set(o.id, (mine.get(o.id) ?? 0) + q);
        alloc.set(p.userId, mine);
        flatUsed.set(flatKey, (flatUsed.get(flatKey) ?? 0) + q);
        remaining -= q;
        progressed = true;
      }
      if (!progressed && participants.every((p) => exclude.has(`${p.flatId}:${o.key}`) || (flatUsed.get(`${p.flatId}:${o.id}`) ?? 0) >= o.maxQtyPerFlat)) {
        throw new Error(`Cannot place ${totals[o.key]} of ${o.key} within per-flat caps`);
      }
    }
  }

  const events: OrderEvent[] = [];
  for (const p of participants) {
    const mine = alloc.get(p.userId);
    if (!mine) continue;
    const times = Array.from({ length: random.chance(0.35) ? 2 : 1 }, () => random.between(from, to)).sort((a, b) => a.getTime() - b.getTime());
    const slots = times.map((at) => ({ round, userId: p.userId, flatId: p.flatId, at, targets: {} as Record<string, number> }));
    for (const [offeringId, qty] of mine) slots[random.int(0, slots.length - 1)].targets[offeringId] = qty;
    events.push(...slots.filter((s) => Object.keys(s.targets).length > 0));
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

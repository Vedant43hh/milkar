// Seeds a demo society with three rounds: two completed (history, refunds, savings) and one open
// (live meters). Orders go through the same pure pricing code the app uses.
//
//   npm run db:seed      (wipes the database in DATABASE_URL first)
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { DEMO_SOCIETY, DEMO_USERS } from "../src/lib/demo";
import { applyQuoteLine, quoteChanges, type IdLot, type QuoteProduct } from "../src/lib/pricing/checkout";
import { buildPurchaseOrders, type ConfirmedProduct } from "../src/lib/pricing/consolidate";
import { deliveryIssueRefund, shortDeliveryRefundKey } from "../src/lib/pricing/delivery";
import { computeFinalization } from "../src/lib/pricing/finalize";
import { lotsQty, lotsTotal } from "../src/lib/pricing/lots";
import { formatINR } from "../src/lib/pricing/money";
import { supplierPriceForTotal } from "../src/lib/pricing/price";
import { QUOTE_TTL_MS } from "../src/lib/pricing/rules";
import type { Tier } from "../src/lib/pricing/tiers";
import { startOfIstDay } from "../src/lib/time";
import { FLAT_NUMBERS, PRODUCTS, RESIDENTS, ROUNDS, SUPPLIERS, TOWERS, type SeedProduct } from "./seed-data";
import { truncateAll } from "./truncate";

const MARGIN_BPS = 300;
const FREEZE_MINUTES = 720;
const HOUR = 3_600_000;
const MINUTE = 60_000;

// ---------- deterministic randomness ----------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261018);
const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const between = (from: Date, to: Date) => new Date(from.getTime() + Math.floor(rng() * (to.getTime() - from.getTime())));
const id = () => randomUUID();
const json = (value: unknown) => value as Prisma.InputJsonValue;

// ---------- records to insert ----------
const rec = {
  rounds: [] as Prisma.OrderRoundCreateManyInput[],
  roundProducts: [] as Prisma.RoundProductCreateManyInput[],
  payments: [] as Prisma.PaymentCreateManyInput[],
  orderItems: [] as Prisma.OrderItemCreateManyInput[],
  lots: [] as Prisma.OrderLotCreateManyInput[],
  walletTxns: [] as Prisma.WalletTransactionCreateManyInput[],
  pos: [] as Prisma.SupplierPurchaseOrderCreateManyInput[],
  poLines: [] as Prisma.PurchaseOrderLineCreateManyInput[],
  distribution: [] as Prisma.DistributionRecordCreateManyInput[],
  issues: [] as Prisma.DeliveryIssueCreateManyInput[],
};

const wallet = new Map<string, number>();
function credit(
  userId: string,
  amountPaise: number,
  type: Prisma.WalletTransactionCreateManyInput["type"],
  idempotencyKey: string,
  createdAt: Date,
  extra: Partial<Prisma.WalletTransactionCreateManyInput> = {},
) {
  if (amountPaise === 0) return;
  wallet.set(userId, (wallet.get(userId) ?? 0) + amountPaise);
  rec.walletTxns.push({ id: id(), userId, amountPaise, type, idempotencyKey, createdAt, ...extra });
}

// ---------- catalog ----------
type CatalogProduct = { id: string; supplierId: string; seed: SeedProduct; tiers: Tier[]; gstBps: number; mrpPaise: number };
type Participant = { userId: string; flatId: string; name: string };
type SimRP = {
  id: string;
  key: string;
  product: CatalogProduct;
  tiers: Tier[];
  gstBps: number;
  minOrderQty: number;
  maxQtyPerFlat: number;
};
type SeedLot = IdLot & { createdAt: Date; paymentId: string };
type SimItem = { id: string; userId: string; flatId: string; rp: SimRP; lots: SeedLot[]; createdAt: Date };
type SimRound = {
  id: string;
  cutoffAt: Date;
  deliveryAt: Date;
  rps: SimRP[];
  items: Map<string, SimItem>;
};
type Event = { userId: string; flatId: string; at: Date; targets: Record<string, number> };

let lotSeq = 0;

function createRound(
  catalog: Map<string, CatalogProduct>,
  societyId: string,
  captainId: string,
  opts: { title: string; cutoffAt: Date; deliveryAt: Date; createdAt: Date; keys: string[]; status: "OPEN" | "COMPLETED" },
): SimRound {
  const roundId = id();
  rec.rounds.push({
    id: roundId,
    societyId,
    createdById: captainId,
    title: opts.title,
    status: opts.status,
    cutoffAt: opts.cutoffAt,
    deliveryAt: opts.deliveryAt,
    marginBps: MARGIN_BPS,
    reductionFreezeMinutes: FREEZE_MINUTES,
    requirePickupCode: true,
    createdAt: opts.createdAt,
  });
  const rps = opts.keys.map((key): SimRP => {
    const product = catalog.get(key);
    if (!product) throw new Error(`Unknown product ${key}`);
    return {
      id: id(),
      key,
      product,
      tiers: product.tiers,
      gstBps: product.gstBps,
      minOrderQty: product.seed.minOrderQty,
      maxQtyPerFlat: product.seed.maxPerFlat,
    };
  });
  return { id: roundId, cutoffAt: opts.cutoffAt, deliveryAt: opts.deliveryAt, rps, items: new Map() };
}

/** Spreads each product's society total across participants, respecting per-flat caps. */
function planEvents(round: SimRound, participants: Participant[], totals: Record<string, number>, from: Date, to: Date): Event[] {
  const alloc = new Map<string, Map<string, number>>();
  const flatUsed = new Map<string, number>();
  for (const rp of round.rps) {
    let remaining = totals[rp.key] ?? 0;
    while (remaining > 0) {
      let progressed = false;
      for (const p of shuffle(participants)) {
        if (remaining === 0) break;
        if (rng() < 0.3) continue;
        const flatKey = `${p.flatId}:${rp.id}`;
        const room = rp.maxQtyPerFlat - (flatUsed.get(flatKey) ?? 0);
        if (room <= 0) continue;
        const q = Math.min(remaining, room, randInt(1, 3));
        const mine = alloc.get(p.userId) ?? new Map<string, number>();
        mine.set(rp.id, (mine.get(rp.id) ?? 0) + q);
        alloc.set(p.userId, mine);
        flatUsed.set(flatKey, (flatUsed.get(flatKey) ?? 0) + q);
        remaining -= q;
        progressed = true;
      }
      if (!progressed && participants.every((p) => (flatUsed.get(`${p.flatId}:${rp.id}`) ?? 0) >= rp.maxQtyPerFlat)) {
        throw new Error(`Cannot place ${totals[rp.key]} of ${rp.key} within per-flat caps`);
      }
    }
  }

  const events: Event[] = [];
  for (const p of participants) {
    const mine = alloc.get(p.userId);
    if (!mine) continue;
    const times = Array.from({ length: rng() < 0.35 ? 2 : 1 }, () => between(from, to)).sort((a, b) => a.getTime() - b.getTime());
    const slots = times.map((at) => ({ userId: p.userId, flatId: p.flatId, at, targets: {} as Record<string, number> }));
    for (const [rpId, qty] of mine) slots[randInt(0, slots.length - 1)].targets[rpId] = qty;
    events.push(...slots.filter((s) => Object.keys(s.targets).length > 0));
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Places orders in time order, pricing each one exactly as checkout does. */
function runEvents(round: SimRound, events: Event[]) {
  const roundWindow = { status: "OPEN", cutoffAt: round.cutoffAt, reductionFreezeMinutes: FREEZE_MINUTES };
  for (const ev of events) {
    const products: QuoteProduct[] = round.rps
      .filter((rp) => rp.id in ev.targets)
      .map((rp) => {
        const sameProduct = [...round.items.values()].filter((i) => i.rp.id === rp.id);
        return {
          roundProductId: rp.id,
          pricing: { tiers: rp.tiers, marginBps: MARGIN_BPS, gstBps: rp.gstBps },
          active: true,
          maxQtyPerFlat: rp.maxQtyPerFlat,
          societyQty: sameProduct.reduce((n, i) => n + lotsQty(i.lots), 0),
          flatOthersQty: sameProduct
            .filter((i) => i.flatId === ev.flatId && i.userId !== ev.userId)
            .reduce((n, i) => n + lotsQty(i.lots), 0),
          userLots: round.items.get(`${ev.userId}:${rp.id}`)?.lots ?? [],
        };
      });
    const result = quoteChanges({
      round: roundWindow,
      now: ev.at,
      products,
      targets: ev.targets,
      walletBalancePaise: wallet.get(ev.userId) ?? 0,
    });
    if (!result.ok) throw new Error(`Seed order rejected: ${JSON.stringify(result.errors)}`);
    const quote = result.quote;
    const paymentId = id();
    const viaGateway = quote.gatewayPaise > 0;
    rec.payments.push({
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
      expiresAt: new Date(ev.at.getTime() - 2 * MINUTE + QUOTE_TTL_MS),
      paidAt: ev.at,
      createdAt: new Date(ev.at.getTime() - 2 * MINUTE),
    });
    for (const line of quote.lines) {
      const key = `${ev.userId}:${line.roundProductId}`;
      const rp = round.rps.find((r) => r.id === line.roundProductId)!;
      const item = round.items.get(key) ?? { id: id(), userId: ev.userId, flatId: ev.flatId, rp, lots: [], createdAt: ev.at };
      item.lots = applyQuoteLine(item.lots, line, (quantity, unitPricePaise) => ({
        id: id(),
        quantity,
        unitPricePaise,
        seq: ++lotSeq,
        createdAt: ev.at,
        paymentId,
      }));
      round.items.set(key, item);
    }
    credit(ev.userId, quote.creditPaise, "CANCEL_REFUND", `CANCEL_REFUND:${paymentId}`, ev.at, { roundId: round.id, paymentId });
    credit(ev.userId, -quote.walletAppliedPaise, "ORDER_DEBIT", `ORDER_DEBIT:${paymentId}`, ev.at, { roundId: round.id, paymentId });
  }
}

type ItemOutcome = { status: "ACTIVE" | "CONFIRMED" | "DROPPED" | "CANCELLED"; finalPaise?: number; refundPaise?: number; absorbedPaise?: number };

/** Applies cutoff results exactly as the finalize job will: refunds, POs and distribution. */
function finalizePast(round: SimRound, captainId: string) {
  const finalizedAt = new Date(round.cutoffAt.getTime() + MINUTE);
  const items = [...round.items.values()];
  const result = computeFinalization({
    marginBps: MARGIN_BPS,
    products: round.rps.map((rp) => ({
      roundProductId: rp.id,
      tiers: rp.tiers,
      gstBps: rp.gstBps,
      minOrderQty: rp.minOrderQty,
      items: items
        .filter((i) => i.rp.id === rp.id)
        .map((i) => ({ orderItemId: i.id, userId: i.userId, flatId: i.flatId, lots: i.lots, chargedPaise: lotsTotal(i.lots) })),
    })),
  });

  const outcomes = new Map<string, ItemOutcome>();
  const confirmed: ConfirmedProduct[] = [];
  const finalUnit = new Map<string, number>();
  for (const p of result.products) {
    const rp = round.rps.find((r) => r.id === p.roundProductId)!;
    const rpRecord = rec.roundProducts.find((r) => r.id === rp.id)!;
    rpRecord.status = p.status;
    rpRecord.finalQty = p.totalQty;
    if (p.status === "CONFIRMED" && p.tier && p.unit) {
      rpRecord.finalSupplierPricePaise = p.tier.supplierPricePaise;
      rpRecord.finalUnitPricePaise = p.unit.totalPaise;
      finalUnit.set(rp.id, p.unit.totalPaise);
      confirmed.push({
        roundProductId: rp.id,
        productId: rp.product.id,
        supplierId: rp.product.supplierId,
        totalQty: p.totalQty,
        supplierPricePaise: p.tier.supplierPricePaise,
        gstBps: rp.gstBps,
      });
    }
    for (const i of p.items) {
      outcomes.set(i.orderItemId, {
        status: p.status,
        finalPaise: i.finalPaise,
        refundPaise: i.refundPaise,
        absorbedPaise: i.absorbedPaise,
      });
      const type = p.status === "DROPPED" ? "DROP_REFUND" : "TIER_REFUND";
      credit(i.userId, i.refundPaise, type, `${type}:${i.orderItemId}`, finalizedAt, { roundId: round.id, orderItemId: i.orderItemId });
    }
  }

  buildPurchaseOrders(confirmed).forEach((po) => {
    const poId = id();
    rec.pos.push({
      id: poId,
      roundId: round.id,
      supplierId: po.supplierId,
      status: "ACKNOWLEDGED",
      subtotalPaise: po.subtotalPaise,
      gstPaise: po.gstPaise,
      totalPaise: po.totalPaise,
      acknowledgedAt: new Date(finalizedAt.getTime() + 3 * HOUR),
      createdAt: finalizedAt,
    });
    for (const line of po.lines) rec.poLines.push({ id: id(), poId, ...line });
  });

  const collectedFlats = new Set(items.filter((i) => outcomes.get(i.id)?.status === "CONFIRMED").map((i) => i.flatId));
  for (const flatId of collectedFlats) {
    rec.distribution.push({
      id: id(),
      roundId: round.id,
      flatId,
      pickupCode: String(randInt(0, 9999)).padStart(4, "0"),
      status: "COLLECTED",
      collectedAt: new Date(round.deliveryAt.getTime() + randInt(5, 180) * MINUTE),
      collectedById: captainId,
    });
  }
  return { outcomes, finalUnit, finalizedAt };
}

function recordItems(round: SimRound, outcomes: Map<string, ItemOutcome>, issues: Map<string, { shortQty: number; damagedQty: number; refund: number }>) {
  for (const item of round.items.values()) {
    const qty = lotsQty(item.lots);
    const outcome = outcomes.get(item.id) ?? { status: qty === 0 ? "CANCELLED" : "ACTIVE" };
    const issue = issues.get(item.id);
    rec.orderItems.push({
      id: item.id,
      roundId: round.id,
      roundProductId: item.rp.id,
      userId: item.userId,
      flatId: item.flatId,
      quantity: qty,
      chargedPaise: lotsTotal(item.lots),
      status: outcome.status,
      finalPaise: outcome.finalPaise ?? null,
      refundPaise: outcome.refundPaise ?? null,
      absorbedPaise: outcome.absorbedPaise ?? null,
      shortQty: issue?.shortQty ?? 0,
      damagedQty: issue?.damagedQty ?? 0,
      issueRefundPaise: issue?.refund ?? 0,
      createdAt: item.createdAt,
    });
    for (const lot of item.lots) {
      rec.lots.push({
        id: lot.id,
        orderItemId: item.id,
        quantity: lot.quantity,
        unitPricePaise: lot.unitPricePaise,
        paymentId: lot.paymentId,
        createdAt: lot.createdAt,
      });
    }
  }
}

function pushRoundProducts(round: SimRound) {
  for (const rp of round.rps) {
    rec.roundProducts.push({
      id: rp.id,
      roundId: round.id,
      productId: rp.product.id,
      supplierId: rp.product.supplierId,
      tiers: json(rp.tiers),
      gstBps: rp.gstBps,
      mrpPaise: rp.product.mrpPaise,
      minOrderQty: rp.minOrderQty,
      maxQtyPerFlat: rp.maxQtyPerFlat,
      status: "ACTIVE",
    });
  }
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to seed in production. Set SEED_ALLOW_PRODUCTION=true for a demo database.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const now = new Date();

  try {
    console.log("Clearing existing data…");
    await truncateAll(prisma);

    // Society and flats
    const societyId = id();
    const flats = new Map<string, { id: string; tower: string; number: string }>();
    for (const tower of TOWERS) for (const number of FLAT_NUMBERS) flats.set(`${tower}-${number}`, { id: id(), tower, number });
    const flatId = (label: string) => {
      const flat = flats.get(label);
      if (!flat) throw new Error(`Unknown flat ${label}`);
      return flat.id;
    };

    // Suppliers and catalog
    const supplierIds = { 1: id(), 2: id() } as const;
    const catalog = new Map<string, CatalogProduct>();
    for (const p of PRODUCTS) {
      const gstBps = p.gstPct * 100;
      catalog.set(p.key, {
        id: id(),
        supplierId: supplierIds[p.supplier],
        seed: p,
        gstBps,
        mrpPaise: p.mrp * 100,
        tiers: p.tiers.map(([minQty, rupees]) => ({
          minQty,
          supplierPricePaise: supplierPriceForTotal(rupees * 100, MARGIN_BPS, gstBps),
        })),
      });
    }

    // Users
    const users: Prisma.UserCreateManyInput[] = [];
    const participants: Participant[] = [];
    const userIds = {} as Record<keyof typeof DEMO_USERS, string>;
    for (const [key, u] of Object.entries(DEMO_USERS) as [keyof typeof DEMO_USERS, (typeof DEMO_USERS)[keyof typeof DEMO_USERS]][]) {
      const userId = id();
      userIds[key] = userId;
      users.push({
        id: userId,
        phone: u.phone,
        name: u.name,
        role: u.role,
        flatId: u.flat ? flatId(u.flat) : null,
        supplierId: u.supplier ? supplierIds[u.supplier] : null,
        createdAt: new Date(now.getTime() - 60 * 24 * HOUR),
      });
      if (u.flat) participants.push({ userId, flatId: flatId(u.flat), name: u.name });
    }
    RESIDENTS.forEach((r, i) => {
      const userId = id();
      users.push({
        id: userId,
        phone: `+9190000010${String(i + 1).padStart(2, "0")}`,
        name: r.name,
        role: "RESIDENT",
        flatId: flatId(r.flat),
        createdAt: new Date(now.getTime() - (50 - i) * 24 * HOUR),
      });
      participants.push({ userId, flatId: flatId(r.flat), name: r.name });
    });
    const captainId = userIds.captain;
    const [rahul, sunita, ...others] = [
      participants.find((p) => p.userId === userIds.resident)!,
      participants.find((p) => p.userId === userIds.captain)!,
      ...participants.filter((p) => p.userId !== userIds.resident && p.userId !== userIds.captain),
    ];
    const pick = (n: number) => [rahul, sunita, ...shuffle(others).slice(0, n)];

    // Round 1 and 2: completed. Round 3: open.
    const at8pm = (daysFromToday: number) => new Date(startOfIstDay(now, daysFromToday).getTime() + 20 * HOUR);
    const at10am = (daysFromToday: number) => new Date(startOfIstDay(now, daysFromToday).getTime() + 10 * HOUR);
    const allIssues = new Map<string, { shortQty: number; damagedQty: number; refund: number }>();

    const pastRounds = [
      { spec: ROUNDS.first, cutoffDay: -20, people: pick(14) },
      { spec: ROUNDS.second, cutoffDay: -6, people: pick(13) },
    ];
    for (const [index, past] of pastRounds.entries()) {
      const cutoffAt = at8pm(past.cutoffDay);
      const round = createRound(catalog, societyId, captainId, {
        title: past.spec.title,
        cutoffAt,
        deliveryAt: at10am(past.cutoffDay + 2),
        createdAt: new Date(cutoffAt.getTime() - 5 * 24 * HOUR),
        keys: Object.keys(past.spec.totals),
        status: "COMPLETED",
      });
      pushRoundProducts(round);
      runEvents(round, planEvents(round, past.people, past.spec.totals, new Date(cutoffAt.getTime() - 4 * 24 * HOUR), new Date(cutoffAt.getTime() - HOUR)));
      const { outcomes, finalUnit, finalizedAt } = finalizePast(round, captainId);
      const roundRecord = rec.rounds.find((r) => r.id === round.id)!;
      roundRecord.finalizedAt = finalizedAt;
      roundRecord.completedAt = new Date(round.deliveryAt.getTime() + 4 * HOUR);

      // The second round had one damaged tray of eggs and one short bag of sugar.
      if (index === 1) {
        const reported: [string, "SHORT" | "DAMAGED"][] = [["eggs", "DAMAGED"], ["sugar", "SHORT"]];
        for (const [key, reason] of reported) {
          const item = [...round.items.values()].find((i) => i.rp.key === key && outcomes.get(i.id)?.status === "CONFIRMED");
          if (!item) continue;
          const refund = deliveryIssueRefund(item.lots, finalUnit.get(item.rp.id)!, 0, 1);
          const createdAt = new Date(round.deliveryAt.getTime() + 30 * MINUTE);
          allIssues.set(item.id, { shortQty: reason === "SHORT" ? 1 : 0, damagedQty: reason === "DAMAGED" ? 1 : 0, refund });
          rec.issues.push({ id: id(), roundId: round.id, flatId: item.flatId, orderItemId: item.id, reason, quantity: 1, refundPaise: refund, createdById: captainId, createdAt, note: reason === "DAMAGED" ? "Tray cracked in transit" : "Missing from supplier delivery" });
          credit(item.userId, refund, "SHORT_DELIVERY_REFUND", shortDeliveryRefundKey(item.id, 1), createdAt, { roundId: round.id, orderItemId: item.id });
        }
      }
      recordItems(round, outcomes, allIssues);
    }

    const openCutoff = at8pm(5);
    const open = createRound(catalog, societyId, captainId, {
      title: ROUNDS.open.title,
      cutoffAt: openCutoff,
      deliveryAt: at10am(7),
      createdAt: new Date(now.getTime() - 3 * 24 * HOUR),
      keys: PRODUCTS.map((p) => p.key),
      status: "OPEN",
    });
    pushRoundProducts(open);
    const openEvents = planEvents(open, pick(13), ROUNDS.open.totals, new Date(now.getTime() - 2 * 24 * HOUR), new Date(now.getTime() - 3 * HOUR));
    // One resident trims an order before the freeze, so the wallet shows a cancellation refund.
    const trimmed = openEvents.find((e) => Object.values(e.targets).some((q) => q >= 2));
    if (trimmed) {
      const [rpId, qty] = Object.entries(trimmed.targets).find(([, q]) => q >= 2)!;
      openEvents.push({ userId: trimmed.userId, flatId: trimmed.flatId, at: new Date(Math.max(trimmed.at.getTime() + HOUR, now.getTime() - 2 * HOUR)), targets: { [rpId]: qty - 1 } });
      openEvents.sort((a, b) => a.at.getTime() - b.at.getTime());
    }
    runEvents(open, openEvents);
    recordItems(open, new Map(), allIssues);

    // Persist in dependency order.
    await prisma.society.create({ data: { id: societyId, ...DEMO_SOCIETY } });
    await prisma.flat.createMany({ data: [...flats.values()].map((f) => ({ id: f.id, societyId, tower: f.tower, number: f.number })) });
    await prisma.supplier.createMany({
      data: ([1, 2] as const).map((n) => ({ id: supplierIds[n], ...SUPPLIERS[n] })),
    });
    await prisma.user.createMany({ data: users });
    await prisma.product.createMany({
      data: [...catalog.values()].map((p) => ({
        id: p.id,
        supplierId: p.supplierId,
        name: p.seed.name,
        category: p.seed.category,
        unit: p.seed.unit,
        packSize: p.seed.packSize,
        mrpPaise: p.mrpPaise,
        gstBps: p.gstBps,
        minOrderQty: p.seed.minOrderQty,
        defaultMaxPerFlat: p.seed.maxPerFlat,
      })),
    });
    await prisma.priceTier.createMany({
      data: [...catalog.values()].flatMap((p) => p.tiers.map((t) => ({ id: id(), productId: p.id, ...t }))),
    });
    await prisma.platformSetting.create({ data: { id: 1, marginBps: MARGIN_BPS, reductionFreezeMinutes: FREEZE_MINUTES } });
    for (const round of rec.rounds) await prisma.orderRound.create({ data: round as Prisma.OrderRoundUncheckedCreateInput });
    await prisma.roundProduct.createMany({ data: rec.roundProducts });
    await prisma.payment.createMany({ data: rec.payments });
    await prisma.orderItem.createMany({ data: rec.orderItems });
    await prisma.orderLot.createMany({ data: rec.lots });
    await prisma.walletTransaction.createMany({ data: rec.walletTxns });
    for (const po of rec.pos) await prisma.supplierPurchaseOrder.create({ data: po as Prisma.SupplierPurchaseOrderUncheckedCreateInput });
    await prisma.purchaseOrderLine.createMany({ data: rec.poLines });
    await prisma.distributionRecord.createMany({ data: rec.distribution });
    await prisma.deliveryIssue.createMany({ data: rec.issues });

    const openItems = [...open.items.values()];
    console.log(`Seeded ${DEMO_SOCIETY.name}: ${flats.size} flats, ${users.length} users, ${catalog.size} products.`);
    console.log(`Rounds: 2 completed, 1 open (closes ${openCutoff.toISOString()}), ${openItems.filter((i) => lotsQty(i.lots) > 0).length} open order lines.`);
    console.log(`Wallet credit outstanding: ${formatINR([...wallet.values()].reduce((a, b) => a + b, 0))}`);
    console.log("\nDemo logins (any 6-digit OTP in mock mode):");
    for (const u of Object.values(DEMO_USERS)) console.log(`  ${u.role.padEnd(9)} ${u.phone.slice(3)}  ${u.name}${u.flat ? ` (${u.flat})` : ""}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

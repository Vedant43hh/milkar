// Seeds two communities with history and live activity, all priced through the real engine:
//
// Green Meadows CHS (apartment society, 40 flats)
//   - grocery rounds: two completed (refunds, short/damaged items), one open with live meters
//   - Pre-Diwali deep cleaning (completed): rated visits, an issue fixed by a free revisit, a no-access visit
//   - AC servicing Service Day (open): 14 flats booked, 6 more unlock ₹400, some slots full
//   - weekly car wash: last week's round finalized (visits this week), this week's open with held slots
//   - interest polls: one past its threshold, two building up, one resident suggestion
// Sunrise Co-living (PG, 12 rooms): a small open grocery round
//
// Built in memory by buildWorld(now), then written by writeWorld; see seed.ts.
import type { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_COMMUNITIES, DEMO_USERS, DEMO_VENDORS, type DemoCommunityKey, type DemoVendorKey } from "../src/lib/demo";
import { notificationKeys } from "../src/lib/notifications";
import { productGroupKey, serviceGroupKey } from "../src/lib/pricing/basis";
import { deliveryIssueRefund, shortDeliveryRefundKey } from "../src/lib/pricing/delivery";
import { lotsQty } from "../src/lib/pricing/lots";
import { applyBps } from "../src/lib/pricing/money";
import { unitPriceAt } from "../src/lib/pricing/price";
import type { Tier } from "../src/lib/pricing/tiers";
import { allocateNoAccessRefunds, noAccessRefund, noAccessRefundKey, noAccessVendorAdjustment } from "../src/lib/services/no-access";
import { generateSlots, holdExpiresAt, oneWeekLater } from "../src/lib/services/slots";
import { startOfIstDay } from "../src/lib/time";
import * as data from "./seed-data";
import {
  createRandom,
  DAY,
  exactVendorPrice,
  FREEZE_MINUTES,
  HOUR,
  id,
  MARGIN_BPS,
  MINUTE,
  planGroceryEvents,
  plus,
  SeedWorld,
  type OrderEvent,
  type Participant,
  type SimBooking,
  type SimOffering,
  type SimRound,
} from "./seed-sim";

type OfferingDraft = Omit<SimOffering, "id">;

/** Builds the whole demo world in memory, deterministically for a given `now`. */
export function buildWorld(now: Date) {
  const world = new SeedWorld(now, createRandom(20261019));
  const { rec, random } = world;
  const day = (offset: number) => startOfIstDay(now, offset);
  const istAt = (offset: number, hour: number, minute = 0) => new Date(day(offset).getTime() + hour * HOUR + minute * MINUTE);

  // ---------- communities and flats ----------
  function addCommunity(key: DemoCommunityKey, blocks: readonly string[], numbers: readonly string[]) {
    const communityId = id();
    rec.communities.push({ id: communityId, ...DEMO_COMMUNITIES[key], createdAt: plus(now, -150 * DAY) });
    const flats = new Map<string, string>();
    for (const tower of blocks) {
      for (const number of numbers) {
        const flatId = id();
        flats.set(`${tower}-${number}`, flatId);
        rec.flats.push({ id: flatId, communityId, tower, number });
      }
    }
    const flatId = (label: string) => {
      const found = flats.get(label);
      if (!found) throw new Error(`Unknown flat ${label} in ${key}`);
      return found;
    };
    return { id: communityId, flats, flatId };
  }
  const communities = {
    greenMeadows: addCommunity("greenMeadows", data.TOWERS, data.FLAT_NUMBERS),
    sunrise: addCommunity("sunrise", data.PG_WINGS, data.PG_ROOMS),
  };
  const gm = communities.greenMeadows;
  const pg = communities.sunrise;

  // ---------- vendors ----------
  const vendorIds = {} as Record<DemoVendorKey, string>;
  for (const key of Object.keys(DEMO_VENDORS) as DemoVendorKey[]) {
    const details = data.VENDOR_DETAILS[key];
    vendorIds[key] = id();
    rec.vendors.push({
      id: vendorIds[key],
      name: DEMO_VENDORS[key].name,
      kind: DEMO_VENDORS[key].kind,
      gstin: details.gstin,
      phone: details.phone,
      city: details.city,
      about: details.about,
      verificationStatus: details.verification,
      verifiedAt: details.verification === "VERIFIED" ? plus(now, -100 * DAY) : null,
      verificationNote: details.note ?? null,
      createdAt: plus(now, -160 * DAY),
    });
  }

  // ---------- grocery catalogue ----------
  const products = new Map<string, { id: string; vendorId: string; seed: data.SeedProduct; gstBps: number; tiers: Tier[] }>();
  for (const p of data.PRODUCTS) {
    const gstBps = p.gstPct * 100;
    const product = {
      id: id(),
      vendorId: vendorIds[p.vendor],
      seed: p,
      gstBps,
      tiers: p.tiers.map(([minQty, rupees]) => ({ minQty, vendorPricePaise: exactVendorPrice(rupees, gstBps) })),
    };
    products.set(p.key, product);
    rec.products.push({
      id: product.id,
      vendorId: product.vendorId,
      name: p.name,
      category: p.category,
      unit: p.unit,
      packSize: p.packSize,
      mrpPaise: p.mrp * 100,
      gstBps,
      minOrderQty: p.minOrderQty,
      defaultMaxPerFlat: p.maxPerFlat,
    });
    for (const t of product.tiers) rec.priceTiers.push({ id: id(), productId: product.id, ...t });
  }
  const productOffering = (key: string): OfferingDraft => {
    const p = products.get(key);
    if (!p) throw new Error(`Unknown product ${key}`);
    return {
      key,
      name: p.seed.name,
      kind: "PRODUCT",
      productId: p.id,
      serviceOptionId: null,
      vendorId: p.vendorId,
      tierGroupKey: productGroupKey(p.id),
      tierBasis: "UNITS",
      unitLabel: null,
      tiers: p.tiers,
      gstBps: p.gstBps,
      mrpPaise: p.seed.mrp * 100,
      minOrderQty: p.seed.minOrderQty,
      maxQtyPerFlat: p.seed.maxPerFlat,
    };
  };

  // ---------- service catalogue ----------
  type CatalogService = { id: string; vendorId: string; seed: data.SeedService; gstBps: number; options: { id: string; seed: data.SeedServiceOption; tiers: Tier[] }[] };
  const services = new Map<string, CatalogService>();
  for (const s of data.SERVICES) {
    const gstBps = s.gstPct * 100;
    const service: CatalogService = { id: id(), vendorId: vendorIds[s.vendor], seed: s, gstBps, options: [] };
    services.set(s.key, service);
    rec.services.push({
      id: service.id,
      vendorId: service.vendorId,
      category: s.category,
      name: s.name,
      description: s.description,
      minFlats: s.minFlats,
      noAccessFeePaise: s.noAccessFee * 100,
      durationMinutes: s.durationMinutes,
      gstBps,
      weeklyByDefault: s.weeklyByDefault ?? false,
      createdAt: plus(now, -140 * DAY),
    });
    s.options.forEach((o, sortOrder) => {
      const option = { id: id(), seed: o, tiers: o.tiers.map(([minQty, rupees]) => ({ minQty, vendorPricePaise: exactVendorPrice(rupees, gstBps) })) };
      service.options.push(option);
      rec.serviceOptions.push({ id: option.id, serviceId: service.id, name: o.name, unitLabel: o.unitLabel, mrpPaise: o.mrp * 100, maxPerFlat: o.maxPerFlat, sortOrder });
      for (const t of option.tiers) rec.optionTiers.push({ id: id(), optionId: option.id, minFlats: t.minQty, vendorPricePaise: t.vendorPricePaise });
    });
    for (const [startTime, endTime, technicians] of s.slots) rec.slotTemplates.push({ id: id(), serviceId: service.id, startTime, endTime, technicians });
  }
  const service = (key: string) => {
    const s = services.get(key);
    if (!s) throw new Error(`Unknown service ${key}`);
    return s;
  };

  // ---------- people ----------
  const people = new Map<string, Participant & { communityId: string }>();
  const userIdOfVendor = {} as Record<DemoVendorKey, string>;
  const addUser = (input: { phone: string; name: string; role: "RESIDENT" | "CAPTAIN" | "VENDOR" | "ADMIN"; flatId?: string; vendorId?: string; communityId?: string; joinedDaysAgo: number }) => {
    const userId = id();
    rec.users.push({
      id: userId,
      phone: input.phone,
      name: input.name,
      role: input.role,
      flatId: input.flatId ?? null,
      vendorId: input.vendorId ?? null,
      createdAt: plus(now, -input.joinedDaysAgo * DAY),
    });
    if (input.flatId && input.communityId) people.set(input.name, { userId, flatId: input.flatId, name: input.name, communityId: input.communityId });
    return userId;
  };
  for (const u of Object.values(DEMO_USERS)) {
    const community = u.home ? communities[u.home.community] : null;
    const userId = addUser({
      phone: u.phone,
      name: u.name,
      role: u.role,
      flatId: community && u.home ? community.flatId(u.home.flat) : undefined,
      communityId: community?.id,
      vendorId: u.vendor ? vendorIds[u.vendor] : undefined,
      joinedDaysAgo: 120,
    });
    if (u.vendor) userIdOfVendor[u.vendor] = userId;
  }
  data.RESIDENTS.forEach((r, i) =>
    addUser({ phone: `+9190000010${String(i + 1).padStart(2, "0")}`, name: r.name, role: "RESIDENT", flatId: gm.flatId(r.flat), communityId: gm.id, joinedDaysAgo: 110 - i }),
  );
  addUser({ phone: "+919000002001", name: data.PG_CAPTAIN.name, role: "CAPTAIN", flatId: pg.flatId(data.PG_CAPTAIN.flat), communityId: pg.id, joinedDaysAgo: 60 });
  data.PG_RESIDENTS.forEach((r, i) =>
    addUser({ phone: `+9190000020${String(i + 2).padStart(2, "0")}`, name: r.name, role: "RESIDENT", flatId: pg.flatId(r.flat), communityId: pg.id, joinedDaysAgo: 50 - i }),
  );
  const person = (name: string) => {
    const p = people.get(name);
    if (!p) throw new Error(`Unknown person ${name}`);
    return p;
  };
  const rahul = person(DEMO_USERS.resident.name);
  const sunita = person(DEMO_USERS.captain.name);
  const meera = person(data.PG_CAPTAIN.name);
  const gmPeople = [...people.values()].filter((p) => p.communityId === gm.id);
  const pgPeople = [...people.values()].filter((p) => p.communityId === pg.id);
  const gmUserIds = gmPeople.map((p) => p.userId);
  const othersInGm = gmPeople.filter((p) => p !== rahul && p !== sunita);
  const vendorUserOf = (vendorId: string) => {
    const key = (Object.keys(vendorIds) as DemoVendorKey[]).find((k) => vendorIds[k] === vendorId)!;
    return userIdOfVendor[key];
  };

  const announce = (round: SimRound, userIds: string[]) =>
    world.at(round.record.createdAt as Date, () =>
      world.notify(userIds, { type: "ROUND_OPENED", params: { round: round.title, cutoffAt: round.cutoffAt.toISOString() }, href: round.href }, round.record.createdAt as Date, notificationKeys.roundOpened(round.id)),
    );
  const notifyVendorOrders = (orders: { id: string; vendorId: string }[], round: SimRound, communityName: string, at: Date) => {
    for (const order of orders) {
      world.notify([vendorUserOf(order.vendorId)], { type: "VENDOR_ORDER", params: { round: round.title, community: communityName }, href: "/vendor/orders" }, at, notificationKeys.vendorOrder(order.id));
    }
  };

  // ---------- grocery rounds ----------
  const groceryIssues = new Map<string, { shortQty: number; damagedQty: number; refund: number }>();
  const groceryRounds: SimRound[] = [];
  function groceryRound(input: { title: string; communityId: string; createdById: string; cutoffAt: Date; deliveryAt: Date; createdAt: Date; keys: string[] }) {
    const round = world.addRound({ kind: "GROCERY", ...input, offerings: input.keys.map(productOffering) });
    groceryRounds.push(round);
    return round;
  }
  const schedule = (events: OrderEvent[]) => {
    for (const ev of events) world.at(ev.at, () => world.order(ev));
  };
  // Vikram keeps his no-access refund in the wallet for car-wash auto-pay, so he skips grocery rounds.
  const reserved = new Set(["Vikram Joshi"]);
  const pick = (n: number) => [rahul, sunita, ...random.shuffle(othersInGm.filter((p) => !reserved.has(p.name))).slice(0, n)];

  const pastGrocery = [
    { spec: data.ROUNDS.first, cutoffDay: -20, people: pick(16) },
    { spec: data.ROUNDS.second, cutoffDay: -6, people: pick(15) },
  ];
  for (const [index, past] of pastGrocery.entries()) {
    const cutoffAt = istAt(past.cutoffDay, 20);
    const round = groceryRound({
      title: past.spec.title,
      communityId: gm.id,
      createdById: sunita.userId,
      cutoffAt,
      deliveryAt: istAt(past.cutoffDay + 2, 10),
      createdAt: plus(cutoffAt, -5 * DAY),
      keys: Object.keys(past.spec.totals),
    });
    announce(round, gmUserIds);
    schedule(planGroceryEvents(world, round, past.people, past.spec.totals, plus(cutoffAt, -4 * DAY), plus(cutoffAt, -HOUR)));
    world.at(plus(cutoffAt, MINUTE), () => {
      const finalizedAt = plus(cutoffAt, MINUTE);
      const { confirmed } = world.finalize(round, finalizedAt);
      const orders = world.issueVendorOrders(round, confirmed, finalizedAt, plus(finalizedAt, 3 * HOUR));
      notifyVendorOrders(orders, round, DEMO_COMMUNITIES.greenMeadows.name, finalizedAt);
      round.record.status = "COMPLETED";
      round.record.completedAt = plus(round.deliveryAt, 4 * HOUR);
      const collected = new Set([...round.items.values()].filter((i) => round.outcomes.get(i.id)?.status === "CONFIRMED").map((i) => i.flatId));
      for (const flatId of collected) {
        rec.distribution.push({
          id: id(),
          roundId: round.id,
          flatId,
          pickupCode: random.code(),
          status: "COLLECTED",
          collectedAt: plus(round.deliveryAt, random.int(5, 180) * MINUTE),
          collectedById: sunita.userId,
        });
      }
      // The festive round had one damaged tray of eggs and one short bag of sugar.
      if (index === 1) {
        const reportedAt = plus(round.deliveryAt, 30 * MINUTE);
        world.at(reportedAt, () => {
          for (const [key, reason] of [["eggs", "DAMAGED"], ["sugar", "SHORT"]] as const) {
            const item = [...round.items.values()].find((i) => i.offering.key === key && round.outcomes.get(i.id)?.status === "CONFIRMED");
            if (!item) continue;
            const refund = deliveryIssueRefund(item.lots, round.finalUnit.get(item.offering.id)!, 0, 1);
            groceryIssues.set(item.id, { shortQty: reason === "SHORT" ? 1 : 0, damagedQty: reason === "DAMAGED" ? 1 : 0, refund });
            rec.orderIssues.push({
              id: id(),
              roundId: round.id,
              flatId: item.flatId,
              orderItemId: item.id,
              reason,
              quantity: 1,
              refundPaise: refund,
              createdById: sunita.userId,
              createdAt: reportedAt,
              note: reason === "DAMAGED" ? "Tray cracked in transit" : "Missing from the vendor's delivery",
            });
            const key2 = shortDeliveryRefundKey(item.id, 1);
            world.credit(item.userId, refund, "SHORT_DELIVERY_REFUND", key2, reportedAt, { roundId: round.id, orderItemId: item.id });
            world.notify([item.userId], { type: "REFUND_CREDITED", params: { amountPaise: refund, reason: "SHORT_DELIVERY_REFUND", round: round.title }, href: "/wallet" }, reportedAt, notificationKeys.refund(key2));
          }
        });
      }
    });
  }

  const openGrocery = groceryRound({
    title: data.ROUNDS.open.title,
    communityId: gm.id,
    createdById: sunita.userId,
    cutoffAt: istAt(5, 20),
    deliveryAt: istAt(7, 10),
    createdAt: plus(now, -3 * DAY),
    keys: data.PRODUCTS.map((p) => p.key),
  });
  announce(openGrocery, gmUserIds);
  // Rice stops one bag short of the 50-bag tier, and Rahul's flat has none: one bag from him
  // unlocks ₹440 for everyone (the demo's tier-unlock moment).
  const openEvents = planGroceryEvents(world, openGrocery, pick(15), data.ROUNDS.open.totals, plus(now, -2 * DAY), plus(now, -3 * HOUR), new Set([`${rahul.flatId}:rice`]));
  // One resident trims an order before the freeze, so the wallet shows a cancellation refund.
  const riceId = world.offering(openGrocery, "rice").id;
  const trimmable = ([id, q]: [string, number]) => q >= 2 && id !== riceId;
  const trimmed = openEvents.find((e) => Object.entries(e.targets).some(trimmable));
  if (trimmed) {
    const [offeringId, qty] = Object.entries(trimmed.targets).find(trimmable)!;
    openEvents.push({ ...trimmed, at: new Date(Math.max(trimmed.at.getTime() + HOUR, now.getTime() - 2 * HOUR)), targets: { [offeringId]: qty - 1 } });
  }
  schedule(openEvents);

  const pgRound = groceryRound({
    title: data.ROUNDS.pg.title,
    communityId: pg.id,
    createdById: meera.userId,
    cutoffAt: istAt(3, 20),
    deliveryAt: istAt(5, 11),
    createdAt: plus(now, -DAY),
    keys: Object.keys(data.ROUNDS.pg.totals),
  });
  announce(pgRound, pgPeople.map((p) => p.userId));
  schedule(planGroceryEvents(world, pgRound, pgPeople, data.ROUNDS.pg.totals, plus(now, -20 * HOUR), plus(now, -2 * HOUR)));

  // ---------- Service Days ----------
  const serviceRounds: SimRound[] = [];
  const bookingMeta = new Map<string, { holdExpiresAt?: Date; repeatOfBookingId?: string; createdAt: Date }>();
  function serviceRound(key: string, input: { title: string; cutoffAt: Date; createdAt: Date; days: Date[]; repeatWeekly?: boolean; repeatOfRoundId?: string }) {
    const svc = service(key);
    const drafts = generateSlots(svc.seed.slots.map(([startTime, endTime, technicians]) => ({ startTime, endTime, technicians })), input.days);
    const offerings: OfferingDraft[] = svc.options.map((o) => ({
      key: o.seed.key,
      name: `${svc.seed.name} · ${o.seed.name}`,
      kind: "SERVICE_OPTION",
      productId: null,
      serviceOptionId: o.id,
      vendorId: svc.vendorId,
      tierGroupKey: serviceGroupKey(svc.id),
      tierBasis: "FLATS",
      unitLabel: o.seed.unitLabel,
      tiers: o.tiers,
      gstBps: svc.gstBps,
      mrpPaise: o.seed.mrp * 100,
      minOrderQty: svc.seed.minFlats,
      maxQtyPerFlat: o.seed.maxPerFlat,
    }));
    const round = world.addRound({
      kind: "SERVICE",
      title: input.title,
      communityId: gm.id,
      createdById: sunita.userId,
      cutoffAt: input.cutoffAt,
      deliveryAt: drafts[0].startsAt,
      createdAt: input.createdAt,
      offerings,
      service: { serviceId: svc.id, vendorId: svc.vendorId, noAccessFeePaise: svc.seed.noAccessFee * 100 },
      repeatWeekly: input.repeatWeekly,
      repeatOfRoundId: input.repeatOfRoundId,
    });
    world.addSlots(round, drafts);
    serviceRounds.push(round);
    announce(round, gmUserIds);
    return { round, svc };
  }
  const bookingEvent = (round: SimRound, who: Participant, at: Date, targets: Record<string, number>, slotIndex: number, flags: { keepSlotWeekly?: boolean; autoPayFromWallet?: boolean } = {}): OrderEvent => ({
    round,
    userId: who.userId,
    flatId: who.flatId,
    at,
    targets: Object.fromEntries(Object.entries(targets).map(([key, qty]) => [world.offering(round, key).id, qty])),
    booking: { slot: round.slots[slotIndex], ...flags },
  });
  const flatResidents = (round: SimRound, flatId: string) => [...new Set(world.flatItems(round, flatId).map((x) => x.item.userId))];

  type VisitPlan = "COMPLETED" | "NO_ACCESS" | "SCHEDULED";
  /** Visits for every booking of a confirmed Service Day, each with its own completion code. */
  function createVisits(round: SimRound, svcKey: string, at: Date, plans: Map<string, VisitPlan>) {
    const svc = service(svcKey);
    const technicians = data.TECHNICIANS[svc.seed.vendor];
    const visits: { id: string; booking: SimBooking; record: (typeof rec.visits)[number] }[] = [];
    [...round.bookings.values()]
      .filter((b) => b.status === "ACTIVE")
      .sort((a, b) => a.slot.startsAt.getTime() - b.slot.startsAt.getTime())
      .forEach((booking, i) => {
        const visitId = id();
        const record: (typeof rec.visits)[number] = {
          id: visitId,
          roundId: round.id,
          bookingId: booking.id,
          flatId: booking.flatId,
          slotId: booking.slot.id,
          kind: "STANDARD",
          status: "SCHEDULED",
          startsAt: booking.slot.startsAt,
          endsAt: booking.slot.endsAt,
          technicianName: technicians[i % technicians.length],
          completionCode: random.code(),
          createdAt: at,
        };
        rec.visits.push(record);
        visits.push({ id: visitId, booking, record });
        world.notify(
          flatResidents(round, booking.flatId),
          { type: "VISIT_SCHEDULED", params: { service: svc.seed.name, startsAt: booking.slot.startsAt.toISOString(), code: record.completionCode }, href: round.href },
          at,
          notificationKeys.visit(visitId, "SCHEDULED"),
        );

        const plan = plans.get(booking.flatId) ?? "SCHEDULED";
        if (plan === "SCHEDULED") return;
        const onTheWayAt = plus(booking.slot.startsAt, -random.int(15, 35) * MINUTE);
        world.at(onTheWayAt, () => {
          record.status = "ON_THE_WAY";
          record.onTheWayAt = onTheWayAt;
          world.notify(flatResidents(round, booking.flatId), { type: "TECHNICIAN_ON_THE_WAY", params: { service: svc.seed.name, technician: record.technicianName! }, href: round.href }, onTheWayAt, notificationKeys.visit(visitId, "ON_THE_WAY"));
        });
        if (plan === "NO_ACCESS") {
          const noAccessAt = plus(booking.slot.startsAt, 20 * MINUTE);
          world.at(noAccessAt, () => markNoAccess(round, svc, record, visitId, noAccessAt));
          return;
        }
        const startedAt = plus(booking.slot.startsAt, random.int(0, 10) * MINUTE);
        const completedAt = plus(startedAt, (svc.seed.durationMinutes - random.int(0, 20)) * MINUTE);
        world.at(completedAt, () => {
          record.status = "COMPLETED";
          record.startedAt = startedAt;
          record.completedAt = completedAt;
          record.codeAttempts = random.chance(0.15) ? 1 : 0;
          world.notify(flatResidents(round, booking.flatId), { type: "VISIT_COMPLETED", params: { service: svc.seed.name }, href: round.href }, completedAt, notificationKeys.visit(visitId, "COMPLETED"));
        });
      });
    return visits;
  }

  function vendorOrderIdOf(round: SimRound): string {
    const order = rec.vendorOrders.find((o) => o.roundId === round.id);
    if (!order?.id) throw new Error(`No vendor order for ${round.title}`);
    return order.id;
  }

  /** NO_ACCESS: refund what the flat paid minus the visit fee; the vendor keeps the fee instead of the job. */
  function markNoAccess(round: SimRound, svc: CatalogService, visit: (typeof rec.visits)[number], visitId: string, at: Date) {
    visit.status = "NO_ACCESS";
    visit.noAccessAt = at;
    const fee = svc.seed.noAccessFee * 100;
    const items = world.flatItems(round, visit.flatId).map(({ item, outcome }) => ({ orderItemId: item.id, userId: item.userId, paidPaise: outcome!.finalPaise }));
    let refunded = 0;
    for (const r of allocateNoAccessRefunds(items, fee)) {
      world.credit(r.userId, r.refundPaise, "NO_ACCESS_REFUND", noAccessRefundKey(visitId, r.orderItemId), at, { roundId: round.id, orderItemId: r.orderItemId });
      refunded += r.refundPaise;
    }
    const { feeKeptPaise } = noAccessRefund(items.reduce((s, i) => s + i.paidPaise, 0), fee);
    const jobValue = world.flatItems(round, visit.flatId).reduce((s, { item }) => {
      const taxable = lotsQty(item.lots) * (rec.offerings.find((o) => o.id === item.offering.id)!.finalVendorPricePaise ?? 0);
      return s + taxable + applyBps(taxable, item.offering.gstBps);
    }, 0);
    rec.vendorAdjustments.push({
      id: id(),
      vendorOrderId: vendorOrderIdOf(round),
      visitId,
      type: "NO_ACCESS_FEE",
      amountPaise: noAccessVendorAdjustment(jobValue, feeKeptPaise),
      note: "Flat locked; resident not reachable on phone",
      createdAt: at,
    });
    world.notify(flatResidents(round, visit.flatId), { type: "VISIT_NO_ACCESS", params: { refundPaise: refunded, feePaise: feeKeptPaise }, href: round.href }, at, notificationKeys.visit(visitId, "NO_ACCESS"));
  }

  const ratingsByVendor = new Map<string, number[]>();
  function rate(visitId: string, round: SimRound, vendorId: string, userId: string, rating: number, comment: string | null, at: Date) {
    world.at(at, () => {
      rec.ratings.push({ id: id(), visitId, userId, vendorId, rating, comment, createdAt: at });
      ratingsByVendor.set(vendorId, [...(ratingsByVendor.get(vendorId) ?? []), rating]);
    });
  }

  // Pre-Diwali deep cleaning: completed 9–10 days ago.
  {
    const cutoffAt = istAt(-12, 20);
    const { round, svc } = serviceRound("deepclean", {
      title: "Pre-Diwali deep cleaning",
      cutoffAt,
      createdAt: plus(cutoffAt, -6 * DAY),
      days: [day(-10), day(-9)],
    });
    const vikram = person("Vikram Joshi");
    const bookers: [Participant, string][] = [
      [rahul, "2bhk"],
      [person("Ananya Iyer"), "1bhk"],
      [sunita, "3bhk"],
      [person("Kavita Patil"), "2bhk"],
      [vikram, "2bhk"],
      [person("Deepa Krishnan"), "3bhk"],
      [person("Swati Kulkarni"), "2bhk"],
      [person("Ritu Singh"), "1bhk"],
    ];
    const times = bookers.map(() => random.between(plus(cutoffAt, -5 * DAY), plus(cutoffAt, -3 * HOUR))).sort((a, b) => a.getTime() - b.getTime());
    bookers.forEach(([who, option], i) => schedule([bookingEvent(round, who, times[i], { [option]: 1 }, Math.floor(i / 2))]));

    world.at(plus(cutoffAt, MINUTE), () => {
      const finalizedAt = plus(cutoffAt, MINUTE);
      const { confirmed } = world.finalize(round, finalizedAt);
      const orders = world.issueVendorOrders(round, confirmed, finalizedAt, plus(finalizedAt, 2 * HOUR));
      notifyVendorOrders(orders, round, DEMO_COMMUNITIES.greenMeadows.name, finalizedAt);
      const plans = new Map<string, VisitPlan>(bookers.map(([who]) => [who.flatId, who === vikram ? "NO_ACCESS" : "COMPLETED"]));
      const visits = createVisits(round, "deepclean", finalizedAt, plans);

      const comments: [number, string | null][] = [
        [5, "Spotless kitchen. The team was polite and on time."],
        [5, null],
        [4, "Good job overall; took a little longer than promised."],
        [5, "Bathrooms look new. Will book again."],
        [3, "Okay, but missed the top of the wardrobes."],
        [4, null],
      ];
      let c = 0;
      for (const visit of visits) {
        const booker = visit.booking.userId;
        const end = plus(visit.booking.slot.startsAt, svc.seed.durationMinutes * MINUTE);
        if (visit.booking.flatId === vikram.flatId) continue;
        if (booker !== rahul.userId) {
          const [rating, comment] = comments[c++ % comments.length];
          rate(visit.id, round, svc.vendorId, booker, rating, comment, plus(end, random.int(2, 20) * HOUR));
          continue;
        }
        // Rahul: balcony and kitchen tiles skipped → issue → one free revisit → resolved.
        const reportedAt = plus(end, 4 * HOUR);
        const issueId = id();
        rate(visit.id, round, svc.vendorId, booker, 2, "Balcony grills and kitchen wall tiles were skipped.", plus(end, 3 * HOUR));
        world.at(reportedAt, () => {
          rec.serviceIssues.push({
            id: issueId,
            visitId: visit.id,
            roundId: round.id,
            flatId: visit.booking.flatId,
            kind: "NOT_DONE_PROPERLY",
            reportedById: booker,
            note: "Balcony grills and the kitchen wall tiles behind the stove were not cleaned.",
            status: "OPEN",
            createdAt: reportedAt,
          });
        });
        const revisitStart = istAt(-8, 10);
        const scheduledAt = plus(reportedAt, 14 * HOUR);
        const revisitId = id();
        world.at(scheduledAt, () => {
          const issue = rec.serviceIssues.find((x) => x.id === issueId)!;
          issue.status = "REVISIT_SCHEDULED";
          rec.visits.push({
            id: revisitId,
            roundId: round.id,
            bookingId: visit.booking.id,
            flatId: visit.booking.flatId,
            slotId: null,
            kind: "REVISIT",
            revisitOfId: visit.id,
            status: "SCHEDULED",
            startsAt: revisitStart,
            endsAt: plus(revisitStart, 3 * HOUR),
            technicianName: data.TECHNICIANS.sparkle[3],
            completionCode: random.code(),
            createdAt: scheduledAt,
          });
          world.notify([booker], { type: "ISSUE_UPDATE", params: { service: svc.seed.name, status: "REVISIT_SCHEDULED" }, href: round.href }, scheduledAt, notificationKeys.issue(issueId, "REVISIT_SCHEDULED"));
        });
        const revisitDone = plus(revisitStart, 2 * HOUR + 10 * MINUTE);
        world.at(revisitDone, () => {
          const revisit = rec.visits.find((v) => v.id === revisitId)!;
          Object.assign(revisit, { status: "COMPLETED", onTheWayAt: plus(revisitStart, -20 * MINUTE), startedAt: plus(revisitStart, 5 * MINUTE), completedAt: revisitDone });
          const issue = rec.serviceIssues.find((x) => x.id === issueId)!;
          Object.assign(issue, {
            status: "RESOLVED",
            resolution: "Free revisit by SparkleHome: balcony grills and kitchen tiles cleaned.",
            resolvedById: userIdOfVendor.sparkle,
            resolvedAt: revisitDone,
          });
          world.notify([booker], { type: "VISIT_COMPLETED", params: { service: `${svc.seed.name} (revisit)` }, href: round.href }, revisitDone, notificationKeys.visit(revisitId, "COMPLETED"));
          world.notify([booker], { type: "ISSUE_UPDATE", params: { service: svc.seed.name, status: "RESOLVED" }, href: round.href }, plus(revisitDone, MINUTE), notificationKeys.issue(issueId, "RESOLVED"));
        });
        rate(revisitId, round, svc.vendorId, booker, 5, "Came back the next day and finished everything properly. Thank you!", plus(revisitDone, 3 * HOUR));
      }
      // The Service Day is complete once the revisit is done.
      const completedAt = plus(istAt(-8, 10), 2 * HOUR + 30 * MINUTE);
      world.at(completedAt, () => {
        round.record.status = "COMPLETED";
        round.record.completedAt = completedAt;
      });
    });
  }

  // AC servicing: open, 14 flats booked across two days; three slots already full.
  {
    const createdAt = plus(now, -2 * DAY - 3 * HOUR);
    const { round } = serviceRound("ac", { title: "AC servicing Service Day", cutoffAt: istAt(4, 20), createdAt, days: [day(6), day(7)] });
    const amit = person("Amit Shah");
    const others = random.shuffle(othersInGm.filter((p) => p !== amit && p.name !== "Pooja Shah" && !reserved.has(p.name))).slice(0, 12);
    // In booking order. Rahul books 10th, after the ₹549 tier unlocked, into day 2, 9–11 AM.
    const bookers = [...others.slice(0, 6), amit, others[6], others[7], rahul, ...others.slice(8)];
    // Slot per booking: day 1 9–11 (3), 11–1 (3) and 4–6 (2) end up full; the rest have room.
    const slotFor = [0, 0, 0, 1, 1, 1, 3, 3, 2, 4, 4, 5, 5, 6];
    const times = bookers.map(() => random.between(plus(createdAt, HOUR), plus(now, -2 * HOUR))).sort((a, b) => a.getTime() - b.getTime());
    bookers.forEach((who, i) => {
      const targets: Record<string, number> = who === rahul ? { split: 2 } : random.chance(0.75) ? { split: random.int(1, 2) } : { window: 1 };
      if (who !== rahul && random.chance(0.2)) targets.window = 1;
      schedule([bookingEvent(round, who, times[i], targets, slotFor[i])]);
    });
    // Pooja adds the window AC to the booking Amit made for their flat: the flat still counts once.
    const pooja = person("Pooja Shah");
    const amitAt = times[bookers.indexOf(amit)];
    schedule([{ round, userId: pooja.userId, flatId: pooja.flatId, at: plus(amitAt, 3 * HOUR), targets: { [world.offering(round, "window").id]: 1 } }]);
  }

  // Weekly car wash: last week's round closed two hours ago; this week's opened with held slots.
  {
    const cutoffAt = new Date(Math.floor(now.getTime() / HOUR) * HOUR - 2 * HOUR);
    const { round: w1 } = serviceRound("carwash", { title: "Weekly car wash", cutoffAt, createdAt: plus(cutoffAt, -6 * DAY), days: [day(2)], repeatWeekly: true });
    // Rahul keeps his slot (held for him to confirm), Vikram keeps his with auto-pay from wallet,
    // Gaurav has auto-pay on but not enough balance, so his slot is held too.
    const bookers: [Participant, Record<string, number>, number, { keepSlotWeekly?: boolean; autoPayFromWallet?: boolean }][] = [
      [rahul, { hatch: 1 }, 0, { keepSlotWeekly: true }],
      [person("Vikram Joshi"), { sedan: 1 }, 0, { keepSlotWeekly: true, autoPayFromWallet: true }],
      [person("Gaurav Mehta"), { suv: 1 }, 1, { keepSlotWeekly: true, autoPayFromWallet: true }],
      [person("Ananya Iyer"), { sedan: 1 }, 0, {}],
      [person("Arjun Menon"), { hatch: 1 }, 2, {}],
      [person("Neha Bhatt"), { sedan: 1 }, 1, {}],
      [person("Joseph D'Souza"), { suv: 1, hatch: 1 }, 2, {}],
      [person("Karan Malhotra"), { hatch: 1 }, 1, {}],
    ];
    const times = bookers.map(() => random.between(plus(cutoffAt, -5 * DAY), plus(cutoffAt, -3 * HOUR))).sort((a, b) => a.getTime() - b.getTime());
    bookers.forEach(([who, targets, slot, flags], i) => schedule([bookingEvent(w1, who, times[i], targets, slot, flags)]));

    const finalizedAt = plus(cutoffAt, MINUTE);
    world.at(finalizedAt, () => {
      const { confirmed } = world.finalize(w1, finalizedAt);
      const orders = world.issueVendorOrders(w1, confirmed, finalizedAt, null);
      notifyVendorOrders(orders, w1, DEMO_COMMUNITIES.greenMeadows.name, finalizedAt);
      createVisits(w1, "carwash", finalizedAt, new Map());

      // Repeat weekly: next week's round opens at finalize, keeping slots for 24 hours.
      const openedAt = plus(finalizedAt, MINUTE);
      const { round: w2 } = serviceRound("carwash", {
        title: "Weekly car wash",
        cutoffAt: oneWeekLater(cutoffAt),
        createdAt: openedAt,
        days: [day(9)],
        repeatWeekly: true,
        repeatOfRoundId: w1.id,
      });
      world.at(openedAt, () => {
        for (const previous of w1.bookings.values()) {
          if (!previous.keepSlotWeekly) continue;
          const slot = w2.slots.find((s) => s.startsAt.getTime() === oneWeekLater(previous.slot.startsAt).getTime())!;
          const targets = Object.fromEntries(
            world.flatItems(w1, previous.flatId).map(({ item }) => [world.offering(w2, item.offering.key).id, lotsQty(item.lots)]),
          );
          const price = Object.entries(targets).reduce((sum, [offeringId, qty]) => {
            const o = w2.offerings.find((x) => x.id === offeringId)!;
            return sum + qty * unitPriceAt({ tiers: o.tiers, marginBps: MARGIN_BPS, gstBps: o.gstBps }, world.basis(w2, o)).totalPaise;
          }, 0);
          const svcName = service("carwash").seed.name;
          if (previous.autoPayFromWallet && world.balance(previous.userId) >= price) {
            world.order({ round: w2, userId: previous.userId, flatId: previous.flatId, at: openedAt, targets, booking: { slot, keepSlotWeekly: true, autoPayFromWallet: true } });
            bookingMeta.set(w2.bookings.get(previous.flatId)!.id, { repeatOfBookingId: previous.id, createdAt: openedAt });
          } else {
            const hold = world.hold(w2, { flatId: previous.flatId, userId: previous.userId, slot, repeatOf: previous });
            const expires = holdExpiresAt(openedAt);
            bookingMeta.set(hold.id, { holdExpiresAt: expires, repeatOfBookingId: previous.id, createdAt: openedAt });
            world.notify(
              [previous.userId],
              { type: "SLOT_HELD", params: { service: svcName, startsAt: slot.startsAt.toISOString(), expiresAt: expires.toISOString() }, href: w2.href },
              openedAt,
              notificationKeys.slotHeld(hold.id),
            );
          }
        }
        // Two new bookings since it opened.
        schedule([
          bookingEvent(w2, person("Sneha Joshi"), plus(now, -HOUR), { hatch: 1 }, 1),
          bookingEvent(w2, person("Farhan Qureshi"), plus(now, -30 * MINUTE), { suv: 1 }, 2),
        ]);
      });
    });
  }

  // ---------- interest polls ----------
  function poll(input: {
    kind: "PRODUCT" | "SERVICE";
    title: string;
    description: string;
    serviceId?: string;
    threshold: number;
    status: "OPEN" | "SUGGESTED";
    createdAt: Date;
    votes?: number;
    voters?: Participant[];
    suggestedBy?: Participant;
  }) {
    const pollId = id();
    const record: (typeof rec.polls)[number] = {
      id: pollId,
      communityId: gm.id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      serviceId: input.serviceId ?? null,
      threshold: input.threshold,
      status: input.status,
      suggestedById: input.suggestedBy?.userId ?? null,
      publishedById: input.status === "OPEN" ? sunita.userId : null,
      publishedAt: input.status === "OPEN" ? input.createdAt : null,
      createdAt: input.createdAt,
    };
    rec.polls.push(record);
    const voters = input.voters ?? [];
    const times = voters.map(() => random.between(plus(input.createdAt, HOUR), plus(now, -HOUR))).sort((a, b) => a.getTime() - b.getTime());
    voters.forEach((voter, i) => {
      world.at(times[i], () => {
        rec.votes.push({ id: id(), pollId, flatId: voter.flatId, userId: voter.userId, createdAt: times[i] });
        if (i + 1 === input.threshold) {
          record.thresholdNotifiedAt = times[i];
          world.notify([sunita.userId], { type: "POLL_THRESHOLD", params: { poll: input.title, votes: i + 1 }, href: "/captain/polls" }, times[i], notificationKeys.pollThreshold(pollId));
        }
      });
    });
    return record;
  }
  /** `n` voters, one per flat: everyone in `include`, then others, never anyone in `exclude`. */
  const voters = (n: number, include: Participant[], exclude: Participant[] = []) => {
    const chosen = [...include];
    const flats = new Set(include.map((p) => p.flatId));
    for (const p of random.shuffle(gmPeople)) {
      if (chosen.length === n) break;
      if (flats.has(p.flatId) || exclude.includes(p)) continue;
      flats.add(p.flatId);
      chosen.push(p);
    }
    if (chosen.length < n) throw new Error(`Only ${chosen.length} flats available to vote, wanted ${n}`);
    return chosen;
  };
  const { pest, tank, veg } = data.POLLS;
  poll({
    kind: "SERVICE",
    title: pest.title,
    description: pest.description,
    serviceId: service(pest.service).id,
    threshold: pest.threshold,
    status: "OPEN",
    createdAt: plus(now, -12 * DAY),
    voters: voters(pest.votes, [rahul, sunita]),
  });
  poll({
    kind: "SERVICE",
    title: tank.title,
    description: tank.description,
    serviceId: service(tank.service).id,
    threshold: tank.threshold,
    status: "OPEN",
    createdAt: plus(now, -6 * DAY),
    voters: voters(tank.votes, [sunita], [rahul]),
  });
  poll({ kind: "PRODUCT", title: veg.title, description: veg.description, threshold: veg.threshold, status: "OPEN", createdAt: plus(now, -4 * DAY), voters: voters(veg.votes, [rahul]) });
  const kavita = person(data.POLLS.suggestion.by);
  const suggestionAt = plus(now, -20 * HOUR);
  const suggestion = poll({
    kind: "SERVICE",
    title: data.POLLS.suggestion.title,
    description: data.POLLS.suggestion.description,
    serviceId: service(data.POLLS.suggestion.service).id,
    threshold: service(data.POLLS.suggestion.service).seed.minFlats,
    status: "SUGGESTED",
    createdAt: suggestionAt,
    suggestedBy: kavita,
  });
  world.at(suggestionAt, () =>
    world.notify([sunita.userId], { type: "POLL_SUGGESTION", params: { poll: suggestion.title, by: kavita.name }, href: "/captain/polls" }, suggestionAt, notificationKeys.pollSuggestion(suggestion.id as string)),
  );

  // ---------- run everything in time order ----------
  world.run();

  for (const round of groceryRounds) world.recordItems(round, groceryIssues);
  for (const round of serviceRounds) {
    world.recordItems(round);
    world.recordBookings(round, bookingMeta);
  }
  for (const vendor of rec.vendors) {
    const ratings = ratingsByVendor.get(vendor.id as string) ?? [];
    vendor.ratingCount = ratings.length;
    vendor.ratingSum = ratings.reduce((a, b) => a + b, 0);
  }

  return { world, openGrocery, gm, communities };
}

/** Inserts a built world, in foreign-key order. The database should be empty. */
export async function writeWorld(prisma: PrismaClient, world: SeedWorld): Promise<void> {
  const { rec } = world;
  const byTime = <T extends { createdAt?: Date | string | null }>(rows: T[]) =>
    [...rows].sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());

  await prisma.community.createMany({ data: rec.communities });
  await prisma.flat.createMany({ data: rec.flats });
  await prisma.vendor.createMany({ data: rec.vendors });
  await prisma.user.createMany({ data: rec.users });
  await prisma.product.createMany({ data: rec.products });
  await prisma.priceTier.createMany({ data: rec.priceTiers });
  await prisma.service.createMany({ data: rec.services });
  await prisma.serviceOption.createMany({ data: rec.serviceOptions });
  await prisma.serviceOptionTier.createMany({ data: rec.optionTiers });
  await prisma.vendorSlotTemplate.createMany({ data: rec.slotTemplates });
  await prisma.platformSetting.create({ data: { id: 1, marginBps: MARGIN_BPS, reductionFreezeMinutes: FREEZE_MINUTES } });
  await prisma.orderRound.createMany({ data: byTime(rec.rounds) });
  await prisma.roundOffering.createMany({ data: rec.offerings });
  await prisma.serviceSlot.createMany({ data: rec.slots });
  await prisma.serviceBooking.createMany({ data: rec.bookings.filter((b) => !b.repeatOfBookingId) });
  await prisma.serviceBooking.createMany({ data: rec.bookings.filter((b) => b.repeatOfBookingId) });
  await prisma.payment.createMany({ data: rec.payments });
  await prisma.orderItem.createMany({ data: rec.orderItems });
  await prisma.orderLot.createMany({ data: rec.lots });
  await prisma.walletTransaction.createMany({ data: rec.walletTxns });
  await prisma.vendorOrder.createMany({ data: byTime(rec.vendorOrders) });
  await prisma.vendorOrderLine.createMany({ data: rec.vendorOrderLines });
  await prisma.serviceVisit.createMany({ data: rec.visits.filter((v) => !v.revisitOfId) });
  await prisma.serviceVisit.createMany({ data: rec.visits.filter((v) => v.revisitOfId) });
  await prisma.vendorAdjustment.createMany({ data: rec.vendorAdjustments });
  await prisma.distributionRecord.createMany({ data: rec.distribution });
  await prisma.serviceIssue.createMany({ data: rec.serviceIssues });
  await prisma.orderIssue.createMany({ data: rec.orderIssues });
  await prisma.visitRating.createMany({ data: rec.ratings });
  await prisma.interestPoll.createMany({ data: rec.polls });
  await prisma.pollVote.createMany({ data: rec.votes });
  await prisma.notification.createMany({ data: rec.notifications });
}

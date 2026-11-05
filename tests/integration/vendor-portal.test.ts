// Phase 14: the vendor portal. Vendors see and acknowledge only their own orders; the payout is the
// order plus every adjustment; visits move only to the vendor's own free technicians; turned-off
// technicians can't log in or get visits; catalogue edits are checked and never touch open rounds.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { readTierRows } from "@/lib/vendor/tier-editor";
import { findUserByPhone } from "@/server/auth";
import { saveOption, saveProduct, saveService, saveSlot, removeSlot, setProductActive } from "@/server/catalogue";
import { startCheckout, type Shopper } from "@/server/checkout";
import { finalizeRound } from "@/server/finalize";
import { addTechnician } from "@/server/registration";
import { createGroceryRound, createServiceRound } from "@/server/rounds";
import { createSession, findSessionUser } from "@/server/session";
import type { VendorActor } from "@/server/vendor-actor";
import { acknowledgeVendorOrder, getVendorOrder, listVendorOrders, vendorEarnings } from "@/server/vendor-orders";
import { reassignVisit, setTechnicianActive, vendorSchedule, vendorTechnicians } from "@/server/vendor-schedule";
import { moveVisit, type VisitUser } from "@/server/visits";
import { truncateAll } from "../../prisma/truncate";
import { makeCatalogue, makeNeighbourhood, nextPhone } from "./helpers";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const now = new Date("2026-10-20T06:00:00Z");
const HOUR = 3_600_000;
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);
const istDay = (offset: number) => new Date(Date.UTC(2026, 9, 20 + offset) - 330 * 60_000);

let seq = 0;
const topUp = (userId: string, amountPaise: number) =>
  prisma.walletTransaction.create({ data: { userId, amountPaise, type: "ADJUSTMENT", idempotencyKey: `TEST:${userId}:${++seq}` } });

async function vendorAccount(vendorId: string): Promise<VendorActor> {
  const user = await prisma.user.create({ data: { phone: nextPhone(), name: "Owner", role: "VENDOR", vendorId } });
  return { id: user.id, role: "VENDOR", vendorId };
}

/**
 * A grocery round (four flats, three bags of rice each) and an AC Service Day (five flats, two
 * technicians), both confirmed.
 */
async function confirmedRounds() {
  const hood = await makeNeighbourhood(`VEN${++seq}`, 7);
  const catalogue = await makeCatalogue();
  const shopper = (u: { id: string; flatId: string | null }): Shopper => ({ id: u.id, flatId: u.flatId!, communityId: hood.community.id });

  const grocery = await createGroceryRound(hood.actor, { title: "Staples", cutoffAt: at(48), deliveryAt: at(72), requirePickupCode: true, products: [{ productId: catalogue.rice.id, maxQtyPerFlat: 4 }] }, now);
  if (!grocery.ok) throw new Error(JSON.stringify(grocery.errors));
  const rice = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: grocery.roundId } });
  for (const r of hood.residents.slice(0, 4)) {
    await topUp(r.id, 3 * 50000);
    expect(await startCheckout(shopper(r), grocery.roundId, { [rice.id]: 3 }, at(1))).toMatchObject({ status: "PAID" });
  }

  const tech = (name: string) => prisma.user.create({ data: { phone: nextPhone(), name, role: "TECHNICIAN", vendorId: catalogue.services.id } });
  const [mahesh, salim] = [await tech("Mahesh"), await tech("Salim")];
  const service = await createServiceRound(hood.actor, { serviceId: catalogue.ac.id, title: "AC Day", cutoffAt: at(48), days: [istDay(5)], repeatWeekly: false }, now);
  if (!service.ok) throw new Error(JSON.stringify(service.errors));
  const split = (await prisma.roundOffering.findMany({ where: { roundId: service.roundId }, orderBy: { mrpPaise: "desc" } }))[0].id;
  const slots = await prisma.serviceSlot.findMany({ where: { roundId: service.roundId }, orderBy: { startsAt: "asc" } });
  for (const [i, r] of hood.residents.slice(2, 7).entries()) {
    await topUp(r.id, 69900);
    expect(await startCheckout(shopper(r), service.roundId, { [split]: 1 }, at(1), { slotId: slots[i < 3 ? 0 : 1].id })).toMatchObject({ status: "PAID" });
  }

  expect(await finalizeRound(grocery.roundId, at(48.02))).toMatchObject({ status: "FINALIZED" });
  expect(await finalizeRound(service.roundId, at(48.02))).toMatchObject({ status: "FINALIZED" });
  const visits = await prisma.serviceVisit.findMany({ where: { roundId: service.roundId }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
  const goodsOwner = await vendorAccount(catalogue.goods.id);
  const servicesOwner = await vendorAccount(catalogue.services.id);
  const asTech = (u: { id: string; name: string | null }): VisitUser => ({ id: u.id, role: "TECHNICIAN", name: u.name, vendorId: catalogue.services.id, managesCommunityId: null });
  return { ...hood, ...catalogue, groceryId: grocery.roundId, serviceId: service.roundId, visits, mahesh, salim, goodsOwner, servicesOwner, asTech };
}

describe("orders", () => {
  it("shows each vendor only their own orders, and acknowledging is theirs alone and happens once", async () => {
    const s = await confirmedRounds();
    const goods = await listVendorOrders(s.goods.id);
    const services = await listVendorOrders(s.services.id);
    expect(goods.map((o) => o.round.title)).toEqual(["Staples"]);
    expect(services.map((o) => o.round.title)).toEqual(["AC Day"]);
    const order = goods[0];
    expect(order.status).toBe("ISSUED");
    expect(order.payout).toEqual({ orderPaise: order.totalPaise, changes: [], adjustmentsPaise: 0, payoutPaise: order.totalPaise });

    // Another vendor's order looks like none at all.
    expect(await getVendorOrder(s.services.id, order.id)).toBeNull();
    const detail = await getVendorOrder(s.goods.id, order.id);
    expect(detail?.lines).toEqual([expect.objectContaining({ quantity: 12, product: expect.objectContaining({ name: "Rice" }) })]);
    expect(detail?.round.community.name).toBeTruthy();

    expect(await acknowledgeVendorOrder(s.servicesOwner, order.id, at(50))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await acknowledgeVendorOrder({ id: s.mahesh.id, role: "TECHNICIAN", vendorId: s.services.id }, services[0].id, at(50))).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await acknowledgeVendorOrder(s.goodsOwner, order.id, at(50))).toEqual({ ok: true, changed: true });
    expect(await acknowledgeVendorOrder(s.goodsOwner, order.id, at(51))).toEqual({ ok: true, changed: false });
    const after = await prisma.vendorOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: "ACKNOWLEDGED", acknowledgedAt: at(50) });
  });

  it("pays the order total plus every adjustment: a no-access visit and a cancelled one", async () => {
    const s = await confirmedRounds();
    const [first, second] = s.visits;
    const techOf = (v: { technicianId: string | null }) => (v.technicianId === s.mahesh.id ? s.mahesh : s.salim);
    expect(await moveVisit(s.asTech(techOf(first)), first.id, { to: "ON_THE_WAY" }, at(100))).toMatchObject({ ok: true });
    expect(await moveVisit(s.asTech(techOf(first)), first.id, { to: "NO_ACCESS" }, at(100.5))).toMatchObject({ ok: true });
    const manager: VisitUser = { id: s.manager.id, role: "MANAGER", name: "Manager", vendorId: null, managesCommunityId: s.community.id };
    expect(await moveVisit(manager, second.id, { to: "CANCELLED", reason: "Rain" }, at(90))).toMatchObject({ ok: true });

    const { orders, summary } = await vendorEarnings(s.services.id, at(120));
    const [order] = orders;
    const adjustments = await prisma.vendorAdjustment.findMany({ where: { vendorOrderId: order.id } });
    expect(adjustments.map((a) => a.type).sort()).toEqual(["NO_ACCESS_FEE", "VISIT_CANCELLED"]);
    expect(order.payout.payoutPaise).toBe(order.totalPaise + adjustments.reduce((sum, a) => sum + a.amountPaise, 0));
    expect(order.payout.payoutPaise).toBeLessThan(order.totalPaise);
    expect(order.payout.changes.map((c) => c.type)).toEqual(["NO_ACCESS_FEE", "VISIT_CANCELLED"]);
    expect(summary).toEqual({ owedPaise: order.payout.payoutPaise, paidPaise: 0, toAcknowledge: 1 });
  });
});

describe("schedule", () => {
  it("lists the vendor's own visits by day and slot", async () => {
    const s = await confirmedRounds();
    const schedule = await vendorSchedule(s.services.id, at(1));
    expect(schedule.total).toBe(5);
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].slots.map((slot) => slot.towers.flatMap((t) => t.visits).length)).toEqual([3, 2]);
    expect((await vendorSchedule(s.goods.id, at(1))).total).toBe(0);
  });

  it("moves a visit only to the vendor's own technician, free at that time, before anyone sets out", async () => {
    const s = await confirmedRounds();
    const ravi = await prisma.user.create({ data: { phone: nextPhone(), name: "Ravi", role: "TECHNICIAN", vendorId: s.services.id } });
    const outsider = await prisma.user.create({ data: { phone: nextPhone(), name: "Other", role: "TECHNICIAN", vendorId: s.goods.id } });
    // Two visits at the same time with different technicians: neither can take the other's.
    const [a, b] = s.visits;
    expect(a.startsAt).toEqual(b.startsAt);
    expect(a.technicianId).not.toBe(b.technicianId);

    expect(await reassignVisit(s.servicesOwner, a.id, b.technicianId!)).toEqual({ ok: false, error: "BUSY" });
    expect(await reassignVisit(s.servicesOwner, a.id, a.technicianId!)).toEqual({ ok: false, error: "SAME_TECHNICIAN" });
    expect(await reassignVisit(s.servicesOwner, a.id, outsider.id)).toEqual({ ok: false, error: "UNKNOWN_TECHNICIAN" });
    expect(await reassignVisit(s.goodsOwner, a.id, ravi.id)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await reassignVisit({ id: s.mahesh.id, role: "TECHNICIAN", vendorId: s.services.id }, a.id, ravi.id)).toEqual({ ok: false, error: "FORBIDDEN" });

    expect(await reassignVisit(s.servicesOwner, a.id, ravi.id)).toEqual({ ok: true, name: "Ravi" });
    expect(await prisma.serviceVisit.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ technicianId: ravi.id, technicianName: "Ravi" });
    // Ravi is busy now, and a visit someone has set out for stays with them.
    expect(await reassignVisit(s.servicesOwner, b.id, ravi.id)).toEqual({ ok: false, error: "BUSY" });
    const techOfB = b.technicianId === s.mahesh.id ? s.mahesh : s.salim;
    expect(await moveVisit(s.asTech(techOfB), b.id, { to: "ON_THE_WAY" }, at(100))).toMatchObject({ ok: true });
    const later = s.visits.find((v) => v.startsAt > b.startsAt)!;
    expect(await reassignVisit(s.servicesOwner, b.id, later.technicianId === s.mahesh.id ? s.salim.id : s.mahesh.id)).toEqual({ ok: false, error: "NOT_SCHEDULED" });
  });
});

describe("technicians", () => {
  it("only their vendor adds them; a turned-off technician can't log in, get visits or be given one", async () => {
    const s = await confirmedRounds();
    // A technician can't add another technician, even for their own vendor.
    expect(await addTechnician({ role: "TECHNICIAN", vendorId: s.services.id }, { phone: nextPhone(), name: "Nope" }, now)).toEqual({ ok: false, error: "FORBIDDEN" });
    const added = await addTechnician({ role: "VENDOR", vendorId: s.services.id }, { phone: nextPhone(), name: "Ravi" }, now);
    if (!added.ok) throw new Error(added.error);
    const ravi = await prisma.user.findUniqueOrThrow({ where: { id: added.userId } });

    // Someone with visits to do keeps them until they're moved.
    const withVisits = await setTechnicianActive(s.servicesOwner, s.mahesh.id, false, at(50));
    expect(withVisits).toMatchObject({ ok: false, error: "HAS_VISITS" });
    expect(withVisits.ok ? 0 : withVisits.visits).toBeGreaterThan(0);
    expect(await setTechnicianActive(s.goodsOwner, ravi.id, false, at(50))).toEqual({ ok: false, error: "NOT_FOUND" });

    const { token } = await createSession(ravi.id, at(49));
    expect(await findSessionUser(token, at(49.5))).not.toBeNull();
    expect(await setTechnicianActive(s.servicesOwner, ravi.id, false, at(50))).toEqual({ ok: true });
    expect(await findSessionUser(token, at(50.5))).toBeNull(); // logged out
    expect((await findUserByPhone(ravi.phone))?.deactivatedAt).toEqual(at(50)); // login refuses this
    expect(await reassignVisit(s.servicesOwner, s.visits.at(-1)!.id, ravi.id)).toEqual({ ok: false, error: "UNKNOWN_TECHNICIAN" });
    const team = await vendorTechnicians(s.services.id);
    expect(team.at(-1)).toMatchObject({ id: ravi.id, deactivatedAt: at(50) });

    expect(await setTechnicianActive(s.servicesOwner, ravi.id, true, at(51))).toEqual({ ok: true });
    expect((await findUserByPhone(ravi.phone))?.deactivatedAt).toBeNull();
  });

  it("gives no visits to technicians turned off before a Service Day is confirmed", async () => {
    const hood = await makeNeighbourhood(`OFF${++seq}`, 4);
    const catalogue = await makeCatalogue();
    const owner = await vendorAccount(catalogue.services.id);
    const on = await prisma.user.create({ data: { phone: nextPhone(), name: "On", role: "TECHNICIAN", vendorId: catalogue.services.id } });
    const off = await prisma.user.create({ data: { phone: nextPhone(), name: "Off", role: "TECHNICIAN", vendorId: catalogue.services.id } });
    expect(await setTechnicianActive(owner, off.id, false, now)).toEqual({ ok: true });
    await prisma.service.update({ where: { id: catalogue.ac.id }, data: { minFlats: 1 } });
    const round = await createServiceRound(hood.actor, { serviceId: catalogue.ac.id, title: "AC Day", cutoffAt: at(48), days: [istDay(5)], repeatWeekly: false }, now);
    if (!round.ok) throw new Error(JSON.stringify(round.errors));
    const split = (await prisma.roundOffering.findMany({ where: { roundId: round.roundId }, orderBy: { mrpPaise: "desc" } }))[0].id;
    const slot = await prisma.serviceSlot.findFirstOrThrow({ where: { roundId: round.roundId }, orderBy: { startsAt: "asc" } });
    for (const r of hood.residents.slice(0, 2)) {
      await topUp(r.id, 69900);
      expect(await startCheckout({ id: r.id, flatId: r.flatId!, communityId: hood.community.id }, round.roundId, { [split]: 1 }, at(1), { slotId: slot.id })).toMatchObject({ status: "PAID" });
    }
    expect(await finalizeRound(round.roundId, at(48.02))).toMatchObject({ status: "FINALIZED" });
    const visits = await prisma.serviceVisit.findMany({ where: { roundId: round.roundId } });
    expect(visits.map((v) => v.technicianId)).toEqual([on.id, on.id]);
  });
});

describe("catalogue", () => {
  const tiers = (...rows: [string, string][]) => {
    const reading = readTierRows(rows.map(([from, price]) => ({ from, price })));
    if (!reading.ok) throw new Error(JSON.stringify(reading.problems));
    return reading.tiers;
  };
  const riceDraft = (over: Partial<Parameters<typeof saveProduct>[2]> = {}) => ({
    name: "Rice",
    category: "GRAINS_FLOUR",
    unit: "KG",
    packSize: 5,
    mrpPaise: 55000,
    gstBps: 500,
    minOrderQty: 10,
    maxPerFlat: 4,
    tiers: tiers(["1", "480"], ["20", "450"]),
    ...over,
  });

  it("checks prices, edits only the vendor's own products, and leaves open rounds as they were", async () => {
    const hood = await makeNeighbourhood(`CAT${++seq}`, 2);
    const catalogue = await makeCatalogue();
    await prisma.vendor.update({ where: { id: catalogue.goods.id }, data: { categories: ["GROCERIES"] } });
    await prisma.vendor.update({ where: { id: catalogue.services.id }, data: { categories: ["HOME_SERVICES"] } });
    const owner = await vendorAccount(catalogue.goods.id);
    const rival = await prisma.vendor.create({ data: { name: "Rival", kind: "GOODS", phone: "+912024000099", city: "Pune", categories: ["GROCERIES"] } });
    const rivalOwner = await vendorAccount(rival.id);
    const servicesOwner = await vendorAccount(catalogue.services.id);

    const open = await createGroceryRound(hood.actor, { title: "Open", cutoffAt: at(48), deliveryAt: at(72), requirePickupCode: true, products: [{ productId: catalogue.rice.id, maxQtyPerFlat: 4 }] }, now);
    if (!open.ok) throw new Error(JSON.stringify(open.errors));
    const before = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: open.roundId } });

    expect(await saveProduct(owner, catalogue.rice.id, riceDraft({ tiers: [{ minQty: 1, vendorPricePaise: 48000 }, { minQty: 20, vendorPricePaise: 48000 }] }), now)).toEqual({ ok: false, errors: ["TIERS"] });
    // ₹540 + 3% + 5% GST is more than the ₹550 MRP.
    expect(await saveProduct(owner, catalogue.rice.id, riceDraft({ tiers: tiers(["1", "540"]) }), now)).toEqual({ ok: false, errors: ["ABOVE_MRP"] });
    expect(await saveProduct(rivalOwner, catalogue.rice.id, riceDraft(), now)).toEqual({ ok: false, errors: ["NOT_FOUND"] });
    expect(await saveProduct(servicesOwner, null, riceDraft(), now)).toEqual({ ok: false, errors: ["FORBIDDEN"] });
    expect(await saveProduct(owner, catalogue.rice.id, riceDraft(), now)).toEqual({ ok: true, id: catalogue.rice.id });
    const saved = await prisma.priceTier.findMany({ where: { productId: catalogue.rice.id }, orderBy: { minQty: "asc" } });
    expect(saved.map((t) => [t.minQty, t.vendorPricePaise])).toEqual([
      [1, 48000],
      [20, 45000],
    ]);
    // The open round kept the prices it opened with.
    expect((await prisma.roundOffering.findUniqueOrThrow({ where: { id: before.id } })).tiers).toEqual(before.tiers);

    const created = await saveProduct(owner, null, riceDraft({ name: "Brown rice" }), now);
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    expect(await prisma.product.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ vendorId: catalogue.goods.id, name: "Brown rice" });
    expect(await setProductActive(rivalOwner, created.id, false)).toBe(false);
    expect(await setProductActive(owner, created.id, false)).toBe(true);
  });

  it("keeps services to the vendor's categories, and time slots apart", async () => {
    const catalogue = await makeCatalogue();
    await prisma.vendor.update({ where: { id: catalogue.services.id }, data: { categories: ["HOME_SERVICES"] } });
    const owner = await vendorAccount(catalogue.services.id);
    const rival = await vendorAccount((await prisma.vendor.create({ data: { name: "Rival", kind: "SERVICES", phone: "+912024000098", city: "Pune", categories: ["HOME_SERVICES"] } })).id);
    const service = { name: "Sofa shampoo", category: "SOFA_CARPET", description: "Dry vacuum, shampoo and dry.", minFlats: 6, noAccessFeePaise: 9900, durationMinutes: 90, gstBps: 1800, weeklyByDefault: false };

    expect(await saveService(owner, null, { ...service, category: "PLUMBER" }, now)).toEqual({ ok: false, errors: ["CATEGORY"] });
    const created = await saveService(owner, null, service, now);
    if (!created.ok) throw new Error(JSON.stringify(created.errors));
    expect(await saveService(rival, created.id, service, now)).toEqual({ ok: false, errors: ["NOT_FOUND"] });

    const option = { name: "3-seater", unitLabel: "sofa", mrpPaise: 99900, maxPerFlat: 2, tiers: tiers(["1", "700"], ["6", "600"]) };
    expect(await saveOption(rival, created.id, null, option)).toEqual({ ok: false, errors: ["NOT_FOUND"] });
    expect(await saveOption(owner, created.id, null, option)).toMatchObject({ ok: true });

    expect(await saveSlot(owner, created.id, null, { startTime: "09:00", endTime: "11:00", technicians: 2 })).toEqual({ ok: true });
    expect(await saveSlot(owner, created.id, null, { startTime: "10:00", endTime: "12:00", technicians: 2 })).toEqual({ ok: false, error: "OVERLAP" });
    expect(await saveSlot(rival, created.id, null, { startTime: "14:00", endTime: "16:00", technicians: 2 })).toEqual({ ok: false, error: "NOT_FOUND" });
    const [slot] = await prisma.vendorSlotTemplate.findMany({ where: { serviceId: created.id } });
    expect(await saveSlot(owner, created.id, slot.id, { startTime: "08:00", endTime: "10:30", technicians: 3 })).toEqual({ ok: true });
    expect(await removeSlot(rival, slot.id)).toBe(false);
    expect(await removeSlot(owner, slot.id)).toBe(true);
  });
});

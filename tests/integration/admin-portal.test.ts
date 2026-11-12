// Phase 15: the platform admin. Only admins make admins and change settings; payouts are marked
// paid once, and only when the round can't change any more; disputes reach the admin; stats add up.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { adminStats, createAdmin, listDisputes, listPayouts, loadPlatformSettings, markPayoutPaid, savePlatformSettings } from "@/server/admin";
import { startCheckout } from "@/server/checkout";
import { collectPickup } from "@/server/distribution";
import { finalizeRound } from "@/server/finalize";
import { getCommunityImpact } from "@/server/impact";
import { resolveServiceIssue } from "@/server/issues";
import { createGroceryRound, createServiceRound, type Actor } from "@/server/rounds";
import { reportVisitIssue } from "@/server/visit-feedback";
import { moveVisit, type VisitUser } from "@/server/visits";
import { truncateAll } from "../../prisma/truncate";
import { at, HOUR, istDay, makeCatalogue, makeNeighbourhood, nextPhone, now, topUp } from "./helpers";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});
beforeEach(async () => {
  await truncateAll(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

let seq = 0;

async function anAdmin(): Promise<Actor> {
  const user = await prisma.user.create({ data: { phone: nextPhone(), name: "Priya", role: "ADMIN" } });
  return { id: user.id, role: "ADMIN", communityId: null };
}

/** A grocery round, four flats with three bags of rice each, confirmed (not yet handed out). */
async function groceryRound() {
  const hood = await makeNeighbourhood(`ADM${++seq}`, 5);
  const catalogue = await makeCatalogue();
  const opened = await createGroceryRound(hood.actor, { title: "Staples", cutoffAt: at(48), deliveryAt: at(72), requirePickupCode: true, products: [{ productId: catalogue.rice.id, maxQtyPerFlat: 4 }] }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const rice = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: opened.roundId } });
  for (const r of hood.residents.slice(0, 4)) {
    await topUp(r.id, 3 * 50000);
    expect(await startCheckout({ id: r.id, flatId: r.flatId!, communityId: hood.community.id }, opened.roundId, { [rice.id]: 3 }, at(1))).toMatchObject({ status: "PAID" });
  }
  expect(await finalizeRound(opened.roundId, at(48.02))).toMatchObject({ status: "FINALIZED" });
  const order = await prisma.vendorOrder.findFirstOrThrow({ where: { roundId: opened.roundId } });
  return { ...hood, ...catalogue, roundId: opened.roundId, order };
}

/** An AC Service Day with two flats booked, confirmed. */
async function serviceDay() {
  const hood = await makeNeighbourhood(`ADS${++seq}`, 3);
  const catalogue = await makeCatalogue();
  await prisma.service.update({ where: { id: catalogue.ac.id }, data: { minFlats: 1 } });
  const tech = await prisma.user.create({ data: { phone: nextPhone(), name: "Mahesh", role: "TECHNICIAN", vendorId: catalogue.services.id } });
  const opened = await createServiceRound(hood.actor, { serviceId: catalogue.ac.id, title: "AC Day", cutoffAt: at(48), days: [istDay(5)], repeatWeekly: false }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const split = (await prisma.roundOffering.findMany({ where: { roundId: opened.roundId }, orderBy: { mrpPaise: "desc" } }))[0].id;
  const slot = await prisma.serviceSlot.findFirstOrThrow({ where: { roundId: opened.roundId }, orderBy: { startsAt: "asc" } });
  const booked = hood.residents.slice(0, 2);
  for (const r of booked) {
    await topUp(r.id, 69900);
    expect(await startCheckout({ id: r.id, flatId: r.flatId!, communityId: hood.community.id }, opened.roundId, { [split]: 1 }, at(1), { slotId: slot.id })).toMatchObject({ status: "PAID" });
  }
  await finalizeRound(opened.roundId, at(48.02));
  const visits = await prisma.serviceVisit.findMany({ where: { roundId: opened.roundId }, orderBy: { id: "asc" } });
  const asTech: VisitUser = { id: tech.id, role: "TECHNICIAN", name: tech.name, vendorId: catalogue.services.id, managesCommunityId: null };
  const order = await prisma.vendorOrder.findFirstOrThrow({ where: { roundId: opened.roundId } });
  return { ...hood, ...catalogue, roundId: opened.roundId, visits, asTech, booked, order };
}

describe("admins and settings", () => {
  it("only an admin adds an admin, and a number can't be used twice", async () => {
    const admin = await anAdmin();
    const phone = nextPhone();
    expect(await createAdmin({ id: "m", role: "MANAGER", communityId: "c" }, { name: "Asha", phone }, now)).toEqual({ ok: false, error: "FORBIDDEN" });
    const made = await createAdmin(admin, { name: " Asha  Rao ", phone }, now);
    if (!made.ok) throw new Error(made.error);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: made.userId } })).toMatchObject({ role: "ADMIN", name: "Asha Rao" });
    expect(await createAdmin(admin, { name: "Asha", phone }, now)).toEqual({ ok: false, error: "ALREADY_REGISTERED" });
  });

  it("changes the margin for new rounds only, and the impact estimates everywhere", async () => {
    const s = await groceryRound();
    const admin = await anAdmin();
    const before = await getCommunityImpact(s.community.id);
    const settings = { ...(await loadPlatformSettings()), marginBps: 500, impactMetresPerTrip: 16_000 };
    expect(await savePlatformSettings({ ...s.actor }, settings)).toEqual({ ok: false, errors: ["FORBIDDEN"] });
    expect(await savePlatformSettings(admin, { ...settings, marginBps: 9_000 })).toEqual({ ok: false, errors: ["MARGIN"] });
    expect(await savePlatformSettings(admin, settings)).toEqual({ ok: true });

    const later = await createGroceryRound(s.actor, { title: "Later", cutoffAt: at(100), deliveryAt: at(120), requirePickupCode: true, products: [{ productId: s.rice.id, maxQtyPerFlat: 4 }] }, now);
    if (!later.ok) throw new Error(JSON.stringify(later.errors));
    expect((await prisma.orderRound.findUniqueOrThrow({ where: { id: later.roundId } })).marginBps).toBe(500);
    expect((await prisma.orderRound.findUniqueOrThrow({ where: { id: s.roundId } })).marginBps).toBe(300);
    const after = await getCommunityImpact(s.community.id);
    expect(after.assumptions.kmPerTrip).toBe(16);
    expect(after.km).toBe(before.km * 2);
  });
});

describe("payouts", () => {
  it("a grocery round is paid once every bag is handed out, once, and the vendor is told", async () => {
    const s = await groceryRound();
    const admin = await anAdmin();
    const owner = await prisma.user.create({ data: { phone: nextPhone(), name: "Ramesh", role: "VENDOR", vendorId: s.goods.id } });
    expect(await markPayoutPaid(admin, s.order.id, at(80))).toEqual({ ok: false, error: "NOT_HANDED_OUT" });
    expect((await listPayouts(at(80))).waiting.map((p) => p.id)).toContain(s.order.id);

    const pickups = await prisma.distributionRecord.findMany({ where: { roundId: s.roundId } });
    for (const p of pickups) await collectPickup({ ...s.actor, staffKind: "PRIMARY" }, s.roundId, p.flatId, p.pickupCode, at(73));
    expect(await markPayoutPaid({ ...s.actor }, s.order.id, at(80))).toEqual({ ok: false, error: "FORBIDDEN" });
    expect((await listPayouts(at(80))).ready.map((p) => p.id)).toEqual([s.order.id]);
    expect(await markPayoutPaid(admin, s.order.id, at(80))).toEqual({ ok: true, amountPaise: s.order.totalPaise });
    expect(await markPayoutPaid(admin, s.order.id, at(81))).toEqual({ ok: false, error: "ALREADY_PAID" });
    expect(await prisma.vendorOrder.findUniqueOrThrow({ where: { id: s.order.id } })).toMatchObject({ status: "PAID", paidAt: at(80), paidById: admin.id });
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "PAYOUT_PAID" } })).toBe(1);
  });

  it("a Service Day is paid only when visits are done, no complaint is open and 48 hours have passed", async () => {
    const s = await serviceDay();
    const admin = await anAdmin();
    expect(await markPayoutPaid(admin, s.order.id, at(200))).toEqual({ ok: false, error: "VISITS_TO_DO" });
    for (const v of s.visits) {
      await moveVisit(s.asTech, v.id, { to: "ON_THE_WAY" }, at(130));
      await moveVisit(s.asTech, v.id, { to: "IN_PROGRESS" }, at(130.1));
      expect(await moveVisit(s.asTech, v.id, { to: "COMPLETED", code: v.completionCode }, at(130.5))).toMatchObject({ ok: true });
    }
    const lastEnd = at(130.5).getTime(); // when the last job was finished
    const soon = new Date(lastEnd + HOUR);
    expect(await markPayoutPaid(admin, s.order.id, soon)).toEqual({ ok: false, error: "COMPLAINT_WINDOW" });
    const owner = s.booked.find((r) => r.flatId === s.visits[0].flatId)!;
    const reported = await reportVisitIssue({ id: owner.id, role: "RESIDENT", flatId: owner.flatId }, { visitId: s.visits[0].id, note: "The filter wasn't cleaned at all." }, soon);
    if (!reported.ok) throw new Error(reported.error);
    const later = new Date(lastEnd + 60 * HOUR);
    expect(await markPayoutPaid(admin, s.order.id, later)).toEqual({ ok: false, error: "COMPLAINT_OPEN" });

    // Left open two days, the complaint reaches the admin, who settles it.
    expect((await listDisputes(soon)).map((d) => d.id)).toEqual([]);
    expect((await listDisputes(later)).map((d) => d.id)).toEqual([reported.issueId]);
    expect(await resolveServiceIssue(admin, reported.issueId, { resolution: "REFUND" }, later)).toMatchObject({ ok: true });
    const paid = await markPayoutPaid(admin, s.order.id, later);
    expect(paid.ok).toBe(true);
    // The refund came off the vendor's payout before it was paid.
    expect(paid.ok && paid.amountPaise).toBeLessThan(s.order.totalPaise);
  });
});

describe("stats", () => {
  it("adds up sales, refunds and impact across every round", async () => {
    const s = await groceryRound();
    const { stats } = await adminStats();
    const items = await prisma.orderItem.findMany({ where: { roundId: s.roundId, status: "CONFIRMED" } });
    const refunds = await prisma.walletTransaction.findMany({ where: { amountPaise: { gt: 0 }, type: { not: "ADJUSTMENT" } } });
    const groceries = stats.verticals.find((v) => v.vertical === "GROCERIES")!;
    expect(groceries.gmvPaise).toBe(items.reduce((sum, i) => sum + (i.finalPaise ?? 0), 0));
    expect(stats.total.gmvPaise).toBe(groceries.gmvPaise);
    expect(stats.total.refundsPaise).toBe(refunds.reduce((sum, r) => sum + r.amountPaise, 0));
    expect(groceries.marginPaise).toBeGreaterThan(0);
    expect(groceries.rounds).toBe(1);
  });
});

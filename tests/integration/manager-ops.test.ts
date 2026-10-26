// Phase 13: running a community. Distribution refunds pay out once; complaints get one free revisit
// or a refund, never both; assistants can run everything but the team and the settings.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { startCheckout, type Shopper } from "@/server/checkout";
import { collectPickup, getDistribution, reportDeliveryIssue } from "@/server/distribution";
import { finalizeRound } from "@/server/finalize";
import { resolveServiceIssue } from "@/server/issues";
import { getManagerHome } from "@/server/manager-home";
import { createGroceryRound, createServiceRound, type Actor } from "@/server/rounds";
import { inviteAssistant, removeAssistant, removeResident, updateCommunitySettings } from "@/server/team";
import { reportVisitIssue } from "@/server/visit-feedback";
import { moveVisit, type VisitUser } from "@/server/visits";
import { walletBalance } from "@/server/wallet";
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
const P500 = 50000; // rice, 1+ bags (until 20)

let seq = 0;
const topUp = (userId: string, amountPaise: number) =>
  prisma.walletTransaction.create({ data: { userId, amountPaise, type: "ADJUSTMENT", idempotencyKey: `TEST:${userId}:${++seq}` } });

async function assistantOf(communityId: string): Promise<Actor> {
  const user = await prisma.user.create({ data: { phone: nextPhone(), name: "Deepak", role: "MANAGER", staffRole: { create: { communityId, kind: "ASSISTANT" } } } });
  return { id: user.id, role: "MANAGER", communityId, staffKind: "ASSISTANT" };
}

/** A grocery round with four flats buying three bags of rice each, confirmed. */
async function deliveredRound() {
  const hood = await makeNeighbourhood(`DST${++seq}`, 5);
  const catalogue = await makeCatalogue();
  const primary: Actor = { ...hood.actor, staffKind: "PRIMARY" };
  const opened = await createGroceryRound(primary, { title: "Staples", cutoffAt: at(48), deliveryAt: at(72), requirePickupCode: true, products: [{ productId: catalogue.rice.id, maxQtyPerFlat: 4 }] }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const rice = await prisma.roundOffering.findFirstOrThrow({ where: { roundId: opened.roundId } });
  const buyers = hood.residents.slice(0, 4);
  for (const b of buyers) {
    await topUp(b.id, 3 * P500);
    const shopper: Shopper = { id: b.id, flatId: b.flatId!, communityId: hood.community.id };
    expect(await startCheckout(shopper, opened.roundId, { [rice.id]: 3 }, at(1))).toMatchObject({ status: "PAID" });
  }
  expect(await finalizeRound(opened.roundId, at(48.02))).toMatchObject({ status: "FINALIZED" });
  const pickups = await prisma.distributionRecord.findMany({ where: { roundId: opened.roundId } });
  const items = await prisma.orderItem.findMany({ where: { roundId: opened.roundId } });
  return { ...hood, ...catalogue, primary, roundId: opened.roundId, buyers, pickups, items };
}

describe("distribution day", () => {
  it("checks each flat's pickup code and completes the round with the last bag", async () => {
    const s = await deliveredRound();
    const data = await getDistribution(s.primary, s.roundId);
    expect(data?.flats).toHaveLength(4);
    expect(data?.flats[0].items).toEqual([expect.objectContaining({ quantity: 3 })]);

    const [first, ...rest] = s.pickups;
    const wrong = first.pickupCode === "0000" ? "1111" : "0000";
    expect(await collectPickup(s.primary, s.roundId, first.flatId, wrong, at(73))).toEqual({ ok: false, error: "WRONG_CODE" });
    expect(await collectPickup(s.primary, s.roundId, first.flatId, ` ${first.pickupCode.slice(0, 2)} ${first.pickupCode.slice(2)} `, at(73))).toEqual({ ok: true, completed: false });
    expect(await collectPickup(s.primary, s.roundId, first.flatId, first.pickupCode, at(73))).toEqual({ ok: false, error: "ALREADY_COLLECTED" });

    // An assistant hands out the rest; the last one completes the round.
    const assistant = await assistantOf(s.community.id);
    for (const [i, p] of rest.entries()) {
      expect(await collectPickup(assistant, s.roundId, p.flatId, p.pickupCode, at(74))).toEqual({ ok: true, completed: i === rest.length - 1 });
    }
    expect(await prisma.orderRound.findUniqueOrThrow({ where: { id: s.roundId } })).toMatchObject({ status: "COMPLETED" });
    expect(await collectPickup(s.primary, s.roundId, first.flatId, first.pickupCode, at(75))).toEqual({ ok: false, error: "ROUND_CLOSED" });
  });

  it("refunds short and damaged units once, at what was paid, and pays the vendor less", async () => {
    const s = await deliveredRound();
    const item = s.items[0];
    const before = await walletBalance(prisma, item.userId);

    expect(await reportDeliveryIssue(s.primary, item.id, { short: 1, damaged: 0 }, at(73))).toEqual({ ok: true, refundPaise: P500 });
    // The same counts again (a double tap, a second manager) refund nothing.
    const again = await Promise.all([reportDeliveryIssue(s.primary, item.id, { short: 1, damaged: 0 }, at(73.1)), reportDeliveryIssue(s.primary, item.id, { short: 1, damaged: 0 }, at(73.1))]);
    expect(again).toEqual([{ ok: true, refundPaise: 0 }, { ok: true, refundPaise: 0 }]);
    expect(await reportDeliveryIssue(s.primary, item.id, { short: 1, damaged: 1 }, at(73.2))).toEqual({ ok: true, refundPaise: P500 });

    expect(await reportDeliveryIssue(s.primary, item.id, { short: 0, damaged: 1 }, at(73.3))).toEqual({ ok: false, error: "CANNOT_DECREASE" });
    expect(await reportDeliveryIssue(s.primary, item.id, { short: 2, damaged: 2 }, at(73.3))).toEqual({ ok: false, error: "TOO_MANY" });

    expect((await walletBalance(prisma, item.userId)) - before).toBe(2 * P500);
    expect(await prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ shortQty: 1, damagedQty: 1, issueRefundPaise: 2 * P500 });
    expect(await prisma.orderIssue.findMany({ where: { orderItemId: item.id }, select: { reason: true, quantity: true, refundPaise: true } })).toEqual(
      expect.arrayContaining([
        { reason: "SHORT", quantity: 1, refundPaise: P500 },
        { reason: "DAMAGED", quantity: 1, refundPaise: P500 },
      ]),
    );
    const adjustments = await prisma.vendorAdjustment.findMany({ where: { type: "ISSUE_REFUND" } });
    expect(adjustments).toHaveLength(2);
    expect(adjustments.every((a) => a.amountPaise < 0)).toBe(true);
  });

  it("isn't open to another community's managers", async () => {
    const s = await deliveredRound();
    const other = await makeNeighbourhood(`OTH${++seq}`, 1);
    const outsider: Actor = { ...other.actor, staffKind: "PRIMARY" };
    expect(await getDistribution(outsider, s.roundId)).toBeNull();
    expect(await collectPickup(outsider, s.roundId, s.pickups[0].flatId, s.pickups[0].pickupCode, at(73))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await reportDeliveryIssue(outsider, s.items[0].id, { short: 1, damaged: 0 }, at(73))).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

/** A Service Day with five flats, confirmed; one technician; the first visit done. */
async function serviceDay() {
  const hood = await makeNeighbourhood(`ISS${++seq}`, 6);
  const catalogue = await makeCatalogue();
  const tech = await prisma.user.create({ data: { phone: nextPhone(), name: "Mahesh", role: "TECHNICIAN", vendorId: catalogue.services.id } });
  const primary: Actor = { ...hood.actor, staffKind: "PRIMARY" };
  const opened = await createServiceRound(primary, { serviceId: catalogue.ac.id, title: "AC Day", cutoffAt: at(48), days: [istDay(5)], repeatWeekly: false }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const split = (await prisma.roundOffering.findMany({ where: { roundId: opened.roundId }, orderBy: { mrpPaise: "desc" } }))[0].id;
  const slots = await prisma.serviceSlot.findMany({ where: { roundId: opened.roundId }, orderBy: { startsAt: "asc" } });
  const booked = hood.residents.slice(0, 5);
  for (const [i, r] of booked.entries()) {
    await topUp(r.id, 69900);
    expect(await startCheckout({ id: r.id, flatId: r.flatId!, communityId: hood.community.id }, opened.roundId, { [split]: 1 }, at(1), { slotId: slots[i < 3 ? 0 : 1].id })).toMatchObject({ status: "PAID" });
  }
  await finalizeRound(opened.roundId, at(48.02));
  const visits = await prisma.serviceVisit.findMany({ where: { roundId: opened.roundId }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
  const asTech: VisitUser = { id: tech.id, role: "TECHNICIAN", name: tech.name, vendorId: catalogue.services.id, managesCommunityId: null };
  const resident = (u: { id: string; flatId: string | null }) => ({ id: u.id, role: "RESIDENT" as const, flatId: u.flatId });
  async function finish(visitId: string, code: string, when: Date) {
    await moveVisit(asTech, visitId, { to: "ON_THE_WAY" }, when);
    await moveVisit(asTech, visitId, { to: "IN_PROGRESS" }, new Date(when.getTime() + 60_000));
    expect(await moveVisit(asTech, visitId, { to: "COMPLETED", code }, new Date(when.getTime() + 120_000))).toMatchObject({ ok: true });
  }
  return { ...hood, ...catalogue, primary, roundId: opened.roundId, booked, visits, asTech, resident, finish };
}

describe("complaints", () => {
  it("get one free revisit; when it's done the complaint is resolved; a second complaint can only be refunded", async () => {
    const s = await serviceDay();
    const visit = s.visits[0];
    const owner = s.booked.find((r) => r.flatId === visit.flatId)!;
    await s.finish(visit.id, visit.completionCode, at(130));
    const reported = await reportVisitIssue(s.resident(owner), { visitId: visit.id, note: "The filter wasn't cleaned at all." }, at(131));
    if (!reported.ok) throw new Error("expected a complaint");

    const assistant = await assistantOf(s.community.id);
    expect(await resolveServiceIssue(assistant, reported.issueId, { resolution: "REVISIT", revisitAt: at(131.5) }, at(131))).toEqual({ ok: false, error: "TOO_SOON" });
    expect(await resolveServiceIssue(assistant, reported.issueId, { resolution: "REVISIT", revisitAt: at(131 + 15 * 24) }, at(131))).toEqual({ ok: false, error: "TOO_FAR" });
    expect(await resolveServiceIssue(assistant, reported.issueId, { resolution: "REVISIT", revisitAt: at(150) }, at(131))).toEqual({ ok: true, refundedPaise: 0 });
    // Never both: once a revisit is booked, nothing else can be done about this complaint.
    expect(await resolveServiceIssue(s.primary, reported.issueId, { resolution: "REFUND" }, at(132))).toEqual({ ok: false, error: "NOT_ALLOWED" });

    const revisit = await prisma.serviceVisit.findUniqueOrThrow({ where: { revisitOfId: visit.id } });
    expect(revisit).toMatchObject({ kind: "REVISIT", status: "SCHEDULED", technicianId: visit.technicianId, startsAt: at(150) });
    await s.finish(revisit.id, revisit.completionCode, at(150));
    expect(await prisma.serviceIssue.findUniqueOrThrow({ where: { id: reported.issueId } })).toMatchObject({ status: "RESOLVED" });

    // Still not right after the revisit: only a refund (or closing it) is left.
    const again = await reportVisitIssue(s.resident(owner), { visitId: revisit.id, note: "Still dripping after the revisit." }, at(151));
    if (!again.ok) throw new Error("expected a second complaint");
    expect(await resolveServiceIssue(s.primary, again.issueId, { resolution: "REVISIT", revisitAt: at(170) }, at(152))).toEqual({ ok: false, error: "NOT_ALLOWED" });
    const before = await walletBalance(prisma, owner.id);
    const refund = await resolveServiceIssue(s.primary, again.issueId, { resolution: "REFUND" }, at(152));
    expect(refund).toEqual({ ok: true, refundedPaise: 54900 });
    expect((await walletBalance(prisma, owner.id)) - before).toBe(54900);
    expect(await resolveServiceIssue(s.primary, again.issueId, { resolution: "REFUND" }, at(153))).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await prisma.serviceIssue.findUniqueOrThrow({ where: { id: again.issueId } })).toMatchObject({ status: "REFUNDED" });
  });

  it("give back exactly the kept visit fee when a no-access visit is disputed", async () => {
    const s = await serviceDay();
    const visit = s.visits[1];
    const owner = s.booked.find((r) => r.flatId === visit.flatId)!;
    await moveVisit(s.asTech, visit.id, { to: "ON_THE_WAY" }, at(130));
    await moveVisit(s.asTech, visit.id, { to: "NO_ACCESS" }, at(130.5));
    const reported = await reportVisitIssue(s.resident(owner), { visitId: visit.id, note: "I was home; nobody rang the bell." }, at(131));
    if (!reported.ok) throw new Error("expected a dispute");
    const before = await walletBalance(prisma, owner.id);
    expect(await resolveServiceIssue(s.primary, reported.issueId, { resolution: "REFUND" }, at(132))).toEqual({ ok: true, refundedPaise: 14900 });
    expect((await walletBalance(prisma, owner.id)) - before).toBe(14900);
  });

  it("can be closed only with a reason the resident sees", async () => {
    const s = await serviceDay();
    const visit = s.visits[0];
    const owner = s.booked.find((r) => r.flatId === visit.flatId)!;
    await s.finish(visit.id, visit.completionCode, at(130));
    const reported = await reportVisitIssue(s.resident(owner), { visitId: visit.id, note: "Not happy with the finish." }, at(131));
    if (!reported.ok) throw new Error("expected a complaint");
    expect(await resolveServiceIssue(s.primary, reported.issueId, { resolution: "REJECT", note: "" }, at(132))).toEqual({ ok: false, error: "NOTE_REQUIRED" });
    expect(await resolveServiceIssue(s.primary, reported.issueId, { resolution: "REJECT", note: "Photos show it was done." }, at(132))).toEqual({ ok: true, refundedPaise: 0 });
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "ISSUE_UPDATE" } })).toBe(2); // received, then closed
  });
});

describe("the team, settings and residents", () => {
  it("lets only the primary Society Manager add or remove assistants and edit the community", async () => {
    const hood = await makeNeighbourhood(`TEAM${++seq}`, 2);
    const primary: Actor = { ...hood.actor, staffKind: "PRIMARY" };
    const assistant = await assistantOf(hood.community.id);

    expect(await inviteAssistant(assistant, hood.community.id, { name: "Ravi", phone: "9876500001" }, now)).toEqual({ ok: false, error: "FORBIDDEN" });
    const added = await inviteAssistant(primary, hood.community.id, { name: "Ravi", phone: "98765 00001" }, now);
    expect(added).toMatchObject({ ok: true });
    expect(await inviteAssistant(primary, hood.community.id, { name: "Ravi again", phone: "9876500001" }, now)).toEqual({ ok: false, error: "ALREADY_REGISTERED" });
    expect(await inviteAssistant(primary, hood.community.id, { name: "Bad", phone: "12345" }, now)).toEqual({ ok: false, error: "INVALID_PHONE" });

    const staff = await prisma.communityStaff.findMany({ where: { communityId: hood.community.id }, orderBy: { createdAt: "asc" } });
    const ravi = staff.find((s) => added.ok && s.userId === added.userId)!;
    expect(ravi).toMatchObject({ kind: "ASSISTANT", addedById: primary.id });
    const primaryStaff = staff.find((s) => s.kind === "PRIMARY")!;
    expect(await removeAssistant(assistant, hood.community.id, ravi.id)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await removeAssistant(primary, hood.community.id, primaryStaff.id)).toEqual({ ok: false, error: "NOT_AN_ASSISTANT" });
    expect(await removeAssistant(primary, hood.community.id, ravi.id)).toEqual({ ok: true });

    const settings = { name: "Green Meadows Phase 2", type: "GATED_COMMUNITY" as const, address: "Baner Road, Pune", city: "Pune", pincode: "411045", blockLabel: "Wing", unitLabel: "Flat" };
    expect(await updateCommunitySettings(assistant, hood.community.id, settings)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await updateCommunitySettings(primary, hood.community.id, { ...settings, pincode: "4110" })).toEqual({ ok: false, error: "INVALID" });
    expect(await updateCommunitySettings(primary, hood.community.id, settings)).toEqual({ ok: true });
    expect(await prisma.community.findUniqueOrThrow({ where: { id: hood.community.id } })).toMatchObject({ name: "Green Meadows Phase 2", blockLabel: "Wing" });
  });

  it("removes a resident (by any manager) only once nothing of theirs is on the go", async () => {
    const s = await deliveredRound();
    const assistant = await assistantOf(s.community.id);
    const buyer = s.buyers[0];
    expect(await removeResident(assistant, s.community.id, buyer.id, at(73))).toEqual({ ok: false, error: "HAS_OPEN_ORDERS" });

    const idle = s.residents[4]; // didn't order
    expect(await removeResident(assistant, s.community.id, idle.id, at(73))).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: idle.id } })).flatId).toBeNull();
    expect(await prisma.notification.count({ where: { userId: idle.id, type: "MEMBER_REMOVED" } })).toBe(1);

    // Once the bags are collected, the buyer can be removed too.
    for (const p of s.pickups) await collectPickup(s.primary, s.roundId, p.flatId, p.pickupCode, at(74));
    expect(await removeResident(s.primary, s.community.id, buyer.id, at(75))).toEqual({ ok: true });

    const other = await makeNeighbourhood(`RMV${++seq}`, 1);
    expect(await removeResident({ ...other.actor, staffKind: "PRIMARY" }, s.community.id, s.buyers[1].id, at(75))).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("counts the community for the manager's dashboard", async () => {
    const s = await deliveredRound();
    const home = await getManagerHome(s.community.id, at(73));
    expect(home).toMatchObject({ residents: 5, flats: 5, openRounds: 0, distributions: [expect.objectContaining({ collected: 0, total: 4 })] });
    expect(home.activeFlats).toBe(4);
  });
});

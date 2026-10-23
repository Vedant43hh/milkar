// Phase 12: repair visits. Technicians move their own visits along; parts are approved (and paid)
// or declined before the work goes on; nothing is charged twice; refunds go back to the wallet;
// problem photos are seen only by the people who need them.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { confirmPayment, startCheckout, type Shopper } from "@/server/checkout";
import { finalizeRound } from "@/server/finalize";
import { getInvoice, getRoundHistory } from "@/server/history";
import { approveParts, declineParts, requestParts, returnUnusedParts } from "@/server/parts";
import { photoForViewer, saveProblemNote, saveProblemPhoto } from "@/server/repairs";
import { createServiceRound } from "@/server/rounds";
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
const P549 = 54900; // split AC, 5+ flats
const P699 = 69900; // split AC, 1+ flats
const HINGE = { name: "Hinge", qty: 2, unitPaise: 18000 };

let seq = 0;
const topUp = (userId: string, amountPaise: number) =>
  prisma.walletTransaction.create({ data: { userId, amountPaise, type: "ADJUSTMENT", idempotencyKey: `TEST:${userId}:${++seq}` } });

/** A confirmed repair day: five flats booked (one each), two technicians, visits scheduled. */
async function repairDay() {
  const hood = await makeNeighbourhood(`REP${++seq}`, 7);
  const catalogue = await makeCatalogue();
  await prisma.service.update({ where: { id: catalogue.ac.id }, data: { category: "PLUMBER", name: "Plumber" } });
  const tech = (name: string) => prisma.user.create({ data: { phone: nextPhone(), name, role: "TECHNICIAN", vendorId: catalogue.services.id } });
  const [mahesh, salim] = [await tech("Mahesh"), await tech("Salim")];
  const vendorUser = await prisma.user.create({ data: { phone: nextPhone(), name: "Sameer", role: "VENDOR", vendorId: catalogue.services.id } });
  const opened = await createServiceRound(hood.actor, { serviceId: catalogue.ac.id, title: "Plumber Day", cutoffAt: at(48), days: [istDay(5)], repeatWeekly: false }, now);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const roundId = opened.roundId;
  const split = (await prisma.roundOffering.findMany({ where: { roundId }, orderBy: { mrpPaise: "desc" } }))[0].id;
  const slots = await prisma.serviceSlot.findMany({ where: { roundId }, orderBy: { startsAt: "asc" } });
  const shopper = (u: { id: string; flatId: string | null }): Shopper => ({ id: u.id, flatId: u.flatId!, communityId: hood.community.id });
  const booked = hood.residents.slice(1, 6);
  for (const [i, r] of booked.entries()) {
    await topUp(r.id, P699);
    expect(await startCheckout(shopper(r), roundId, { [split]: 1 }, at(1), { slotId: slots[i < 3 ? 0 : 1].id })).toMatchObject({ status: "PAID" });
  }
  expect(await finalizeRound(roundId, at(48.02))).toMatchObject({ status: "FINALIZED" });
  const visits = await prisma.serviceVisit.findMany({ where: { roundId }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
  const asTech = (u: { id: string; name: string | null }): VisitUser => ({ id: u.id, role: "TECHNICIAN", name: u.name, vendorId: catalogue.services.id, managesCommunityId: null });
  const resident = (u: { id: string; flatId: string | null }) => ({ id: u.id, role: "RESIDENT" as const, flatId: u.flatId });
  /** A visit given to a technician and started, with its flat's resident. */
  async function started(index = 0) {
    const visit = visits[index];
    const who = visit.technicianId === mahesh.id ? mahesh : salim;
    const owner = booked.find((r) => r.flatId === visit.flatId)!;
    expect(await moveVisit(asTech(who), visit.id, { to: "ON_THE_WAY" }, at(100))).toEqual({ ok: true, status: "ON_THE_WAY" });
    expect(await moveVisit(asTech(who), visit.id, { to: "IN_PROGRESS" }, at(100.2))).toEqual({ ok: true, status: "IN_PROGRESS" });
    return { visit, tech: who, other: who.id === mahesh.id ? salim : mahesh, owner };
  }
  return { ...hood, ...catalogue, roundId, split, slots, booked, visits, mahesh, salim, vendorUser, asTech, resident, started };
}

describe("technicians and their visits", () => {
  it("gives each confirmed visit a technician, different ones within a slot", async () => {
    const s = await repairDay();
    expect(s.visits).toHaveLength(5);
    expect(s.visits.every((v) => v.technicianId && v.technicianName)).toBe(true);
    const firstSlot = s.visits.filter((v) => v.startsAt.getTime() === s.slots[0].startsAt.getTime());
    expect(new Set(firstSlot.slice(0, 2).map((v) => v.technicianId)).size).toBe(2);
  });

  it("lets a technician move only their own visits, and tells the household they're on the way", async () => {
    const s = await repairDay();
    const visit = s.visits[0];
    const mine = visit.technicianId === s.mahesh.id ? s.mahesh : s.salim;
    const notMine = mine === s.mahesh ? s.salim : s.mahesh;
    expect(await moveVisit(s.asTech(notMine), visit.id, { to: "ON_THE_WAY" }, at(100))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await moveVisit(s.asTech(mine), visit.id, { to: "ON_THE_WAY" }, at(100))).toEqual({ ok: true, status: "ON_THE_WAY" });
    const household = s.booked.find((r) => r.flatId === visit.flatId)!;
    expect(await prisma.notification.count({ where: { userId: household.id, type: "TECHNICIAN_ON_THE_WAY" } })).toBe(1);
    expect(await moveVisit(s.asTech(mine), visit.id, { to: "COMPLETED", code: visit.completionCode }, at(100.1))).toEqual({ ok: false, error: "INVALID_TRANSITION" });
  });

  it("finishes only with the resident's code, counting wrong tries", async () => {
    const s = await repairDay();
    const { visit, tech } = await s.started();
    expect(await moveVisit(s.asTech(tech), visit.id, { to: "COMPLETED" }, at(101))).toEqual({ ok: false, error: "CODE_REQUIRED" });
    const wrong = visit.completionCode === "0000" ? "1111" : "0000";
    expect(await moveVisit(s.asTech(tech), visit.id, { to: "COMPLETED", code: wrong }, at(101))).toEqual({ ok: false, error: "WRONG_CODE", attemptsLeft: 4 });
    expect(await moveVisit(s.asTech(tech), visit.id, { to: "COMPLETED", code: visit.completionCode }, at(101.1))).toEqual({ ok: true, status: "COMPLETED" });
    expect(await prisma.serviceVisit.findUniqueOrThrow({ where: { id: visit.id } })).toMatchObject({ status: "COMPLETED", codeAttempts: 1 });
  });

  it("refunds what was paid minus the visit fee when the technician can't get in", async () => {
    const s = await repairDay();
    const visit = s.visits[1];
    const tech = visit.technicianId === s.mahesh.id ? s.mahesh : s.salim;
    const owner = s.booked.find((r) => r.flatId === visit.flatId)!;
    await moveVisit(s.asTech(tech), visit.id, { to: "ON_THE_WAY" }, at(100));
    const before = await walletBalance(prisma, owner.id);
    expect(await moveVisit(s.asTech(tech), visit.id, { to: "NO_ACCESS" }, at(100.3))).toEqual({ ok: true, status: "NO_ACCESS" });
    expect((await walletBalance(prisma, owner.id)) - before).toBe(P549 - 14900);
    expect(await prisma.vendorAdjustment.count({ where: { visitId: visit.id, type: "NO_ACCESS_FEE" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "VISIT_NO_ACCESS" } })).toBe(1);
  });
});

describe("parts", () => {
  it("can be asked for only while working, one request at a time", async () => {
    const s = await repairDay();
    const visit = s.visits[0];
    const tech = visit.technicianId === s.mahesh.id ? s.mahesh : s.salim;
    expect(await requestParts(tech, visit.id, [HINGE], at(99))).toEqual({ ok: false, error: "NOT_IN_PROGRESS" });
    await moveVisit(s.asTech(tech), visit.id, { to: "ON_THE_WAY" }, at(100));
    await moveVisit(s.asTech(tech), visit.id, { to: "IN_PROGRESS" }, at(100.2));
    const other = tech === s.mahesh ? s.salim : s.mahesh;
    expect(await requestParts(other, visit.id, [HINGE], at(100.3))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await requestParts(tech, visit.id, [{ ...HINGE, qty: 0 }], at(100.3))).toEqual({ ok: false, error: "INVALID_ITEM" });

    const both = await Promise.all([requestParts(tech, visit.id, [HINGE], at(100.4)), requestParts(tech, visit.id, [HINGE], at(100.4))]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toEqual({ ok: false, error: "ALREADY_WAITING" });
    expect(await prisma.partsRequest.count({ where: { visitId: visit.id } })).toBe(1);
    const owner = s.booked.find((r) => r.flatId === visit.flatId)!;
    expect(await prisma.notification.count({ where: { userId: owner.id, type: "PARTS_APPROVAL" } })).toBe(1);
  });

  it("block the visit from finishing until the resident answers", async () => {
    const s = await repairDay();
    const { visit, tech, owner } = await s.started();
    const asked = await requestParts(tech, visit.id, [HINGE], at(101));
    expect(await moveVisit(s.asTech(tech), visit.id, { to: "COMPLETED", code: visit.completionCode }, at(101.1))).toEqual({ ok: false, error: "PARTS_PENDING" });
    if (!asked.ok) throw new Error("expected a request");
    expect(await declineParts(s.resident(owner), asked.requestId, at(101.2))).toEqual({ ok: true });
    expect(await moveVisit(s.asTech(tech), visit.id, { to: "COMPLETED", code: visit.completionCode }, at(101.3))).toEqual({ ok: true, status: "COMPLETED" });
    expect(await prisma.payment.count({ where: { purpose: "PARTS" } })).toBe(0); // declining costs nothing
  });

  it("approved from the wallet: paid at once, debited once, and passed on to the vendor", async () => {
    const s = await repairDay();
    const { visit, tech, owner } = await s.started();
    const asked = await requestParts(tech, visit.id, [HINGE], at(101));
    if (!asked.ok) throw new Error("expected a request");
    await topUp(owner.id, 36000);
    const before = await walletBalance(prisma, owner.id);
    expect(await approveParts(s.resident(owner), asked.requestId, at(101.1))).toEqual({ status: "PAID" });
    expect(before - (await walletBalance(prisma, owner.id))).toBe(36000);
    expect(await prisma.partsRequest.findUniqueOrThrow({ where: { id: asked.requestId } })).toMatchObject({ status: "APPROVED", pendingVisitId: null, decidedById: owner.id });
    expect(await prisma.payment.findFirstOrThrow({ where: { partsRequestId: asked.requestId } })).toMatchObject({ purpose: "PARTS", provider: "WALLET", status: "PAID", chargePaise: 36000 });
    expect(await prisma.vendorAdjustment.findFirstOrThrow({ where: { visitId: visit.id, type: "PARTS" } })).toMatchObject({ amountPaise: 36000 });
    expect(await approveParts(s.resident(owner), asked.requestId, at(101.2))).toEqual({ status: "REJECTED", error: "ALREADY_DECIDED" });
  });

  it("approved through UPI: the wallet pays its share, the payment confirms it, and a second payment goes to the wallet", async () => {
    const s = await repairDay();
    const { visit, tech, owner } = await s.started();
    const asked = await requestParts(tech, visit.id, [HINGE], at(101));
    if (!asked.ok) throw new Error("expected a request");
    await topUp(owner.id, 10000);
    const walletBefore = await walletBalance(prisma, owner.id);
    const first = await approveParts(s.resident(owner), asked.requestId, at(101.1));
    const second = await approveParts(s.resident(owner), asked.requestId, at(101.1)); // tapped twice
    expect(first).toMatchObject({ status: "AWAITING_PAYMENT", gatewayPaise: 36000 - walletBefore });
    if (first.status !== "AWAITING_PAYMENT" || second.status !== "AWAITING_PAYMENT") throw new Error("expected payments");

    expect(await confirmPayment(first.paymentId, "pay_1", at(101.15))).toMatchObject({ status: "PAID" });
    expect(await confirmPayment(second.paymentId, "pay_2", at(101.16))).toMatchObject({ status: "CREDITED_TO_WALLET", reason: "PARTS_DECIDED" });
    expect(await confirmPayment(first.paymentId, "pay_1", at(101.17))).toMatchObject({ status: "PAID", repeat: true });

    // Charged once: the wallet's whole share left, and the second payment's UPI money came back.
    expect(await walletBalance(prisma, owner.id)).toBe(36000 - walletBefore);
    expect(await prisma.walletTransaction.count({ where: { userId: owner.id, type: "PARTS_DEBIT" } })).toBe(1);
    expect(await prisma.partsRequest.findUniqueOrThrow({ where: { id: asked.requestId } })).toMatchObject({ status: "APPROVED" });
  });

  it("approved by two people in the flat at once: charged once", async () => {
    const s = await repairDay();
    const { visit, tech, owner } = await s.started();
    const spouse = await prisma.user.create({ data: { phone: nextPhone(), name: "Spouse", flatId: owner.flatId } });
    const asked = await requestParts(tech, visit.id, [HINGE], at(101));
    if (!asked.ok) throw new Error("expected a request");
    await topUp(owner.id, 36000);
    await topUp(spouse.id, 36000);
    const results = await Promise.all([approveParts(s.resident(owner), asked.requestId, at(101.1)), approveParts(s.resident(spouse), asked.requestId, at(101.1))]);
    expect(results.filter((r) => r.status === "PAID")).toHaveLength(1);
    expect(results.filter((r) => r.status === "REJECTED")).toHaveLength(1);
    expect(await prisma.walletTransaction.count({ where: { type: "PARTS_DEBIT" } })).toBe(1);
    expect(await prisma.payment.count({ where: { purpose: "PARTS", status: "PAID" } })).toBe(1);
  });

  it("not used: refunded to whoever paid, while the job goes on", async () => {
    const s = await repairDay();
    const { visit, tech, other, owner } = await s.started();
    const asked = await requestParts(tech, visit.id, [HINGE], at(101));
    if (!asked.ok) throw new Error("expected a request");
    await topUp(owner.id, 36000);
    await approveParts(s.resident(owner), asked.requestId, at(101.1));
    const before = await walletBalance(prisma, owner.id);
    expect(await returnUnusedParts(other, asked.requestId, at(101.2))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await returnUnusedParts(tech, asked.requestId, at(101.2))).toEqual({ ok: true });
    expect(await returnUnusedParts(tech, asked.requestId, at(101.3))).toEqual({ ok: false, error: "NOT_REFUNDABLE" });
    expect((await walletBalance(prisma, owner.id)) - before).toBe(36000);
    expect(await prisma.vendorAdjustment.findFirstOrThrow({ where: { visitId: visit.id, type: "PARTS" } })).toMatchObject({ amountPaise: 0 });
  });

  it("are refunded in full, with the visit, when a started job is cancelled", async () => {
    const s = await repairDay();
    const { visit, tech, owner } = await s.started();
    const first = await requestParts(tech, visit.id, [HINGE], at(101));
    if (!first.ok) throw new Error("expected a request");
    await topUp(owner.id, 36000);
    await approveParts(s.resident(owner), first.requestId, at(101.1));
    const second = await requestParts(tech, visit.id, [{ name: "Tap", qty: 1, unitPaise: 45000 }], at(101.2)); // still waiting when cancelled
    if (!second.ok) throw new Error("expected a request");

    const before = await walletBalance(prisma, owner.id);
    const manager: VisitUser = { id: s.manager.id, role: "MANAGER", name: "Manager", vendorId: null, managesCommunityId: s.community.id };
    expect(await moveVisit(manager, visit.id, { to: "CANCELLED", reason: "Needs a mason first" }, at(101.3))).toEqual({ ok: true, status: "CANCELLED" });
    expect((await walletBalance(prisma, owner.id)) - before).toBe(P549 + 36000);
    expect(await prisma.partsRequest.findUniqueOrThrow({ where: { id: first.requestId } })).toMatchObject({ status: "REFUNDED" });
    expect(await prisma.partsRequest.findUniqueOrThrow({ where: { id: second.requestId } })).toMatchObject({ status: "DECLINED", pendingVisitId: null });
    expect(await prisma.serviceVisit.findUniqueOrThrow({ where: { id: visit.id } })).toMatchObject({ cancelReason: "Needs a mason first" });
    expect(await prisma.vendorAdjustment.findFirstOrThrow({ where: { visitId: visit.id, type: "PARTS" } })).toMatchObject({ amountPaise: 0 });
    expect(await prisma.vendorAdjustment.count({ where: { visitId: visit.id, type: "VISIT_CANCELLED" } })).toBe(1);
  });
});

describe("the repair bill", () => {
  it("adds the parts paid for to the group-priced visit, on the order and the invoice, matching the ledger", async () => {
    const s = await repairDay();
    const { visit, tech, owner } = await s.started();
    const asked = await requestParts(tech, visit.id, [HINGE, { name: "Screws", qty: 1, unitPaise: 4000 }], at(101));
    if (!asked.ok) throw new Error("expected a request");
    await topUp(owner.id, 40000);
    await approveParts(s.resident(owner), asked.requestId, at(101.1));
    await moveVisit(s.asTech(tech), visit.id, { to: "COMPLETED", code: visit.completionCode }, at(101.5));

    const user = { id: owner.id, flatId: owner.flatId!, communityId: s.community.id };
    const history = await getRoundHistory(user, s.roundId, at(102));
    expect(history?.visits[0].bill).toEqual({ visitPaise: P549, parts: [HINGE, { name: "Screws", qty: 1, unitPaise: 4000 }], partsPaise: 40000, pendingPaise: 0, totalPaise: P549 + 40000 });

    const result = await getInvoice({ ...user, name: owner.name }, s.roundId);
    expect(result?.invoice.lines.map((l) => [l.description, l.amountPaise])).toEqual([
      ["Plumber · Split AC", P549],
      ["Part: Hinge", 36000],
      ["Part: Screws", 4000],
    ]);
    // Paid (visit at the 1+ price, then parts) less refunds equals the invoice.
    expect(result?.money.netPaise).toBe(result?.invoice.totals.totalPaise);
    expect(result?.money).toMatchObject({ paidPaise: P699 + 40000, refundedPaise: P699 - P549 });
  });
});

describe("problem notes and photos", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3]);

  it("can be changed until the technician sets out", async () => {
    const s = await repairDay();
    const owner = s.booked[0];
    expect(await saveProblemNote(s.resident(owner), s.roundId, "  The tap drips  ")).toEqual({ ok: true });
    expect((await prisma.serviceBooking.findFirstOrThrow({ where: { roundId: s.roundId, flatId: owner.flatId! } })).problemNote).toBe("The tap drips");
    expect(await saveProblemNote(s.resident(s.residents[6]), s.roundId, "Not booked")).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await saveProblemNote(s.resident(owner), s.roundId, "x".repeat(501))).toEqual({ ok: false, error: "NOTE_TOO_LONG" });

    const visit = s.visits.find((v) => v.flatId === owner.flatId)!;
    const tech = visit.technicianId === s.mahesh.id ? s.mahesh : s.salim;
    await moveVisit(s.asTech(tech), visit.id, { to: "ON_THE_WAY" }, at(100));
    expect(await saveProblemNote(s.resident(owner), s.roundId, "Too late")).toEqual({ ok: false, error: "TOO_LATE" });
    expect(await saveProblemPhoto(s.resident(owner), s.roundId, { bytes: jpeg, width: 4, height: 3 }, at(100))).toEqual({ ok: false, error: "TOO_LATE" });
  });

  it("are shown only to the flat, its technician, the vendor and the community's managers", async () => {
    const s = await repairDay();
    const owner = s.booked[0];
    const saved = await saveProblemPhoto(s.resident(owner), s.roundId, { bytes: jpeg, width: 4, height: 3 }, at(50));
    if (!saved.ok) throw new Error("expected a photo");
    expect(await saveProblemPhoto(s.resident(owner), s.roundId, { bytes: new Uint8Array(Buffer.from("<svg onload=alert(1)>")), width: 4, height: 3 }, at(50))).toEqual({
      ok: false,
      error: "NOT_AN_IMAGE",
    });

    const visit = s.visits.find((v) => v.flatId === owner.flatId)!;
    const assigned = visit.technicianId === s.mahesh.id ? s.mahesh : s.salim;
    const otherTech = assigned === s.mahesh ? s.salim : s.mahesh;
    const elsewhere = await makeNeighbourhood(`OTH${++seq}`, 2);
    const viewer = (u: { id: string; role: "RESIDENT" | "TECHNICIAN" | "VENDOR" | "MANAGER" | "ADMIN"; flatId?: string | null; vendorId?: string | null; managesCommunityId?: string | null }) => ({
      flatId: null,
      vendorId: null,
      managesCommunityId: null,
      ...u,
    });
    const sees = async (v: ReturnType<typeof viewer>) => (await photoForViewer(v, saved.photoId)) !== null;

    expect(await sees(viewer({ id: owner.id, role: "RESIDENT", flatId: owner.flatId }))).toBe(true);
    expect(await sees(viewer({ id: s.booked[1].id, role: "RESIDENT", flatId: s.booked[1].flatId }))).toBe(false);
    expect(await sees(viewer({ id: assigned.id, role: "TECHNICIAN", vendorId: s.services.id }))).toBe(true);
    expect(await sees(viewer({ id: otherTech.id, role: "TECHNICIAN", vendorId: s.services.id }))).toBe(false);
    expect(await sees(viewer({ id: s.vendorUser.id, role: "VENDOR", vendorId: s.services.id }))).toBe(true);
    expect(await sees(viewer({ id: s.manager.id, role: "MANAGER", managesCommunityId: s.community.id }))).toBe(true);
    expect(await sees(viewer({ id: elsewhere.manager.id, role: "MANAGER", managesCommunityId: elsewhere.community.id }))).toBe(false);
    expect(await sees(viewer({ id: "someone", role: "ADMIN" }))).toBe(false);
  });
});

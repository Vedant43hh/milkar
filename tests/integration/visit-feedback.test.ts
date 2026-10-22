// Residents rating a visit and reporting a problem with it: only for their own flat's visits, once
// each, within the rules (done before rating; 48 hours to complain), with the managers told.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { rateVisit, reportVisitIssue } from "@/server/visit-feedback";
import { truncateAll } from "../../prisma/truncate";
import { makeServiceDay, nextPhone } from "./helpers";

const HOUR = 3_600_000;
const doneAt = new Date("2026-10-25T05:00:00Z");
const after = (hours: number) => new Date(doneAt.getTime() + hours * HOUR);

let day: Awaited<ReturnType<typeof makeServiceDay>>;
let residentA: { id: string; role: "RESIDENT"; flatId: string };
let familyA: { id: string; role: "RESIDENT"; flatId: string };
let residentB: { id: string; role: "RESIDENT"; flatId: string };
let assistant: string;

async function visit(flatIndex: number, userId: string, status: "COMPLETED" | "NO_ACCESS" | "SCHEDULED") {
  const flat = day.flats[flatIndex];
  const booking = await prisma.serviceBooking.upsert({
    where: { roundId_flatId: { roundId: day.round.id, flatId: flat.id } },
    update: {},
    create: { roundId: day.round.id, flatId: flat.id, slotId: day.slots[0].id, userId, status: "ACTIVE" },
  });
  await prisma.serviceVisit.deleteMany({ where: { bookingId: booking.id } });
  return prisma.serviceVisit.create({
    data: {
      roundId: day.round.id,
      bookingId: booking.id,
      flatId: flat.id,
      slotId: day.slots[0].id,
      status,
      startsAt: day.slots[0].startsAt,
      endsAt: day.slots[0].endsAt,
      completionCode: "4821",
      completedAt: status === "COMPLETED" ? doneAt : null,
      noAccessAt: status === "NO_ACCESS" ? doneAt : null,
    },
  });
}

beforeAll(async () => {
  await truncateAll(prisma);
  day = await makeServiceDay({ capacities: [3] });
  const resident = (flatIndex: number, name: string) =>
    prisma.user.create({ data: { phone: nextPhone(), name, flatId: day.flats[flatIndex].id } }).then((u) => ({ id: u.id, role: "RESIDENT" as const, flatId: day.flats[flatIndex].id }));
  residentA = await resident(0, "Asha");
  familyA = await resident(0, "Ravi");
  residentB = await resident(1, "Meera");
  assistant = (await prisma.user.create({ data: { phone: nextPhone(), name: "Deepak", role: "MANAGER", staffRole: { create: { communityId: day.communityId, kind: "ASSISTANT" } } } })).id;
});

beforeEach(async () => {
  await prisma.notification.deleteMany();
  await prisma.serviceIssue.deleteMany();
  await prisma.visitRating.deleteMany();
  await prisma.vendor.update({ where: { id: day.vendorId }, data: { ratingSum: 0, ratingCount: 0 } });
});

afterAll(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

describe("rating a visit", () => {
  it("records one rating per visit and keeps the vendor's totals in step", async () => {
    const v = await visit(0, residentA.id, "COMPLETED");
    expect(await rateVisit(residentA, { visitId: v.id, rating: 4, comment: "  Neat work  " }, after(2))).toEqual({ ok: true });
    expect(await prisma.visitRating.findUniqueOrThrow({ where: { visitId: v.id } })).toMatchObject({ rating: 4, comment: "Neat work", userId: residentA.id, vendorId: day.vendorId });
    expect(await prisma.vendor.findUniqueOrThrow({ where: { id: day.vendorId } })).toMatchObject({ ratingSum: 4, ratingCount: 1 });

    // Someone else in the same flat can't rate it again.
    expect(await rateVisit(familyA, { visitId: v.id, rating: 1, comment: "" }, after(3))).toEqual({ ok: false, error: "ALREADY_RATED" });
    expect(await prisma.vendor.findUniqueOrThrow({ where: { id: day.vendorId } })).toMatchObject({ ratingSum: 4, ratingCount: 1 });
  });

  it("rates once even when two people in the flat send at the same moment", async () => {
    const v = await visit(0, residentA.id, "COMPLETED");
    const results = await Promise.all([rateVisit(residentA, { visitId: v.id, rating: 5, comment: "" }, after(1)), rateVisit(familyA, { visitId: v.id, rating: 2, comment: "" }, after(1))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "ALREADY_RATED" }]);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: day.vendorId } })).ratingCount).toBe(1);
  });

  it("only rates finished visits to the resident's own flat, with 1 to 5 stars", async () => {
    const done = await visit(0, residentA.id, "COMPLETED");
    const upcoming = await visit(1, residentB.id, "SCHEDULED");
    expect(await rateVisit(residentB, { visitId: done.id, rating: 5, comment: "" }, after(1))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await rateVisit(residentB, { visitId: upcoming.id, rating: 5, comment: "" }, after(1))).toEqual({ ok: false, error: "NOT_COMPLETED" });
    expect(await rateVisit(residentA, { visitId: done.id, rating: 0, comment: "" }, after(1))).toEqual({ ok: false, error: "INVALID_RATING" });
    expect(await rateVisit(residentA, { visitId: done.id, rating: 4.5, comment: "" }, after(1))).toEqual({ ok: false, error: "INVALID_RATING" });
    expect(await rateVisit(residentA, { visitId: done.id, rating: 5, comment: "x".repeat(301) }, after(1))).toEqual({ ok: false, error: "COMMENT_TOO_LONG" });
    expect(await rateVisit({ id: assistant, role: "MANAGER", flatId: null }, { visitId: done.id, rating: 5, comment: "" }, after(1))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await prisma.visitRating.count()).toBe(0);
  });
});

describe("reporting a problem", () => {
  it("opens a complaint, tells every manager of the community and gives the household a receipt", async () => {
    const v = await visit(0, residentA.id, "COMPLETED");
    const result = await reportVisitIssue(residentA, { visitId: v.id, note: "The filter wasn't degreased at all." }, after(47));
    expect(result.ok).toBe(true);
    const issue = await prisma.serviceIssue.findUniqueOrThrow({ where: { visitId: v.id } });
    expect(issue).toMatchObject({ kind: "NOT_DONE_PROPERLY", status: "OPEN", reportedById: residentA.id, flatId: day.flats[0].id, note: "The filter wasn't degreased at all." });

    const managers = await prisma.notification.findMany({ where: { type: "ISSUE_REPORTED" }, orderBy: { userId: "asc" } });
    expect(managers.map((n) => n.userId).sort()).toEqual([day.userId, assistant].sort());
    expect(managers[0]).toMatchObject({ params: { service: "AC servicing", flat: "Flat A-101", kind: "NOT_DONE_PROPERLY" }, href: `/manager/rounds/${day.round.id}` });
    const receipts = await prisma.notification.findMany({ where: { type: "ISSUE_UPDATE" } });
    expect(receipts.map((n) => n.userId).sort()).toEqual([residentA.id, familyA.id].sort());
    expect(await prisma.notification.count({ where: { userId: residentB.id } })).toBe(0);
  });

  it("disputes the fee for a no-access visit", async () => {
    const v = await visit(1, residentB.id, "NO_ACCESS");
    expect(await reportVisitIssue(residentB, { visitId: v.id, note: "I was home all morning; nobody rang." }, after(5))).toMatchObject({ ok: true });
    expect(await prisma.serviceIssue.findUniqueOrThrow({ where: { visitId: v.id } })).toMatchObject({ kind: "NO_ACCESS_DISPUTE" });
  });

  it("allows one complaint per visit, within 48 hours of it ending, from someone in the flat", async () => {
    const v = await visit(0, residentA.id, "COMPLETED");
    const note = "Half the job was left undone.";
    expect(await reportVisitIssue(residentA, { visitId: v.id, note }, after(48))).toEqual({ ok: false, error: "WINDOW_CLOSED" });
    expect(await reportVisitIssue(residentB, { visitId: v.id, note }, after(1))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await reportVisitIssue(residentA, { visitId: v.id, note: "Too short" }, after(1))).toEqual({ ok: false, error: "INVALID_NOTE" });
    expect(await reportVisitIssue(residentA, { visitId: v.id, note }, after(1))).toMatchObject({ ok: true });
    expect(await reportVisitIssue(familyA, { visitId: v.id, note }, after(2))).toEqual({ ok: false, error: "ALREADY_REPORTED" });

    const upcoming = await visit(1, residentB.id, "SCHEDULED");
    expect(await reportVisitIssue(residentB, { visitId: upcoming.id, note }, after(1))).toEqual({ ok: false, error: "NOT_REPORTABLE" });
    expect(await prisma.serviceIssue.count()).toBe(1);
  });

  it("files one complaint when two people in the flat report at once", async () => {
    const v = await visit(0, residentA.id, "COMPLETED");
    const note = "The motor is making a new noise since.";
    const results = await Promise.all([reportVisitIssue(residentA, { visitId: v.id, note }, after(1)), reportVisitIssue(familyA, { visitId: v.id, note }, after(1))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "ALREADY_REPORTED" });
    expect(await prisma.notification.count({ where: { type: "ISSUE_REPORTED" } })).toBe(2); // two managers, told once each
  });
});

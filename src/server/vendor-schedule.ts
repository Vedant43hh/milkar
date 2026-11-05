import "server-only";
import { prisma } from "@/lib/db";
import { startOfIstDay } from "@/lib/time";
import { checkReassign, groupSchedule, type ReassignProblem } from "@/lib/vendor/schedule";
import { lockRound } from "./round-lock";
import { runsVendor, type VendorActor } from "./vendor-actor";

// A vendor's visits from today on, and who does each one; and the technicians themselves.

const ACTIVE = ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS"] as const;

/** The next two weeks of visits (today included), grouped by day, slot, tower and flat. */
export async function vendorSchedule(vendorId: string, now: Date) {
  const [visits, technicians] = await Promise.all([
    prisma.serviceVisit.findMany({
      where: { round: { vendorId }, startsAt: { gte: startOfIstDay(now), lt: startOfIstDay(now, 15) }, status: { not: "CANCELLED" } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        status: true,
        kind: true,
        startsAt: true,
        endsAt: true,
        technicianId: true,
        technicianName: true,
        technician: { select: { name: true } },
        flat: { select: { tower: true, number: true, community: { select: { name: true, unitLabel: true, blockLabel: true } } } },
        round: { select: { id: true, title: true, service: { select: { name: true } } } },
        booking: { select: { problemNote: true } },
      },
    }),
    activeTechnicians(vendorId),
  ]);
  const rows = visits.map((v) => ({ ...v, tower: v.flat.tower, flatNumber: v.flat.number, community: v.flat.community.name }));
  return { days: groupSchedule(rows), technicians, total: visits.length };
}

export type ScheduleRow = Awaited<ReturnType<typeof vendorSchedule>>["days"][number]["slots"][number]["towers"][number]["visits"][number];

/** Technicians who can be given visits: the vendor's own, not turned off. Oldest first, as at cutoff. */
export async function activeTechnicians(vendorId: string) {
  return prisma.user.findMany({
    where: { vendorId, role: "TECHNICIAN", deactivatedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

export type ReassignError = ReassignProblem | "FORBIDDEN" | "NOT_FOUND" | "UNKNOWN_TECHNICIAN";

/** Gives a visit nobody has set out for yet to another of the vendor's technicians, if they're free then. */
export async function reassignVisit(actor: VendorActor, visitId: string, technicianId: string): Promise<{ ok: true; name: string } | { ok: false; error: ReassignError }> {
  const vendorId = runsVendor(actor);
  if (!vendorId) return { ok: false, error: "FORBIDDEN" };
  const found = await prisma.serviceVisit.findFirst({ where: { id: visitId, round: { vendorId } }, select: { roundId: true } });
  if (!found) return { ok: false, error: "NOT_FOUND" };
  return prisma.$transaction(async (tx) => {
    await lockRound(tx, found.roundId);
    const visit = await tx.serviceVisit.findUniqueOrThrow({ where: { id: visitId }, select: { status: true, startsAt: true, endsAt: true, technicianId: true } });
    // Lock the technician too: turning them off, or giving them another visit at the same time,
    // waits for this one (and sees it).
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${technicianId} FOR UPDATE`;
    const technician = await tx.user.findFirst({ where: { id: technicianId, vendorId, role: "TECHNICIAN", deactivatedAt: null }, select: { id: true, name: true } });
    if (!technician) return { ok: false, error: "UNKNOWN_TECHNICIAN" } as const;
    const otherVisits = await tx.serviceVisit.findMany({
      where: { technicianId, id: { not: visitId }, status: { in: [...ACTIVE] }, startsAt: { lt: visit.endsAt }, endsAt: { gt: visit.startsAt } },
      select: { status: true, startsAt: true, endsAt: true },
    });
    const problem = checkReassign(visit, { technicianId, otherVisits });
    if (problem) return { ok: false, error: problem } as const;
    // Only if it's still the way it was when checked (another tap may have moved it).
    const { count } = await tx.serviceVisit.updateMany({
      where: { id: visitId, status: "SCHEDULED", technicianId: visit.technicianId },
      data: { technicianId, technicianName: technician.name },
    });
    if (count !== 1) return { ok: false, error: "NOT_SCHEDULED" } as const;
    return { ok: true, name: technician.name ?? "" } as const;
  });
}

/**
 * The vendor's technicians, turned off ones last, with how many visits each still has to do
 * (not finished, whenever they were due: the same count that stops them being turned off).
 */
export async function vendorTechnicians(vendorId: string) {
  const technicians = await prisma.user.findMany({
    where: { vendorId, role: "TECHNICIAN" },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      phone: true,
      createdAt: true,
      deactivatedAt: true,
      _count: { select: { technicianVisits: { where: { status: { in: [...ACTIVE] } } } } },
    },
  });
  return technicians
    .map(({ _count, ...t }) => ({ ...t, upcoming: _count.technicianVisits }))
    .sort((a, b) => Number(a.deactivatedAt !== null) - Number(b.deactivatedAt !== null));
}

export type TechnicianStateError = "FORBIDDEN" | "NOT_FOUND" | "HAS_VISITS";

/**
 * Turns a technician off (they're logged out and can't log in or get visits) or back on. Someone
 * with visits still to do keeps them: move those to a colleague first.
 */
export async function setTechnicianActive(
  actor: VendorActor,
  technicianId: string,
  active: boolean,
  now: Date,
): Promise<{ ok: true } | { ok: false; error: TechnicianStateError; visits?: number }> {
  const vendorId = runsVendor(actor);
  if (!vendorId) return { ok: false, error: "FORBIDDEN" };
  return prisma.$transaction(async (tx) => {
    // Lock the person, so a reassignment to them can't slip in while they're being turned off.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${technicianId} AND "vendorId" = ${vendorId} AND role = 'TECHNICIAN' FOR UPDATE`;
    if (rows.length === 0) return { ok: false, error: "NOT_FOUND" } as const;
    if (active) {
      await tx.user.update({ where: { id: technicianId }, data: { deactivatedAt: null } });
      return { ok: true } as const;
    }
    const visits = await tx.serviceVisit.count({ where: { technicianId, status: { in: [...ACTIVE] } } });
    if (visits > 0) return { ok: false, error: "HAS_VISITS", visits } as const;
    await tx.user.update({ where: { id: technicianId }, data: { deactivatedAt: now } });
    await tx.session.deleteMany({ where: { userId: technicianId } });
    return { ok: true } as const;
  });
}

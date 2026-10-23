import "server-only";
import { prisma } from "@/lib/db";
import { MAX_CODE_ATTEMPTS } from "@/lib/services/visit";
import { partsActions, partsTotal, readParts } from "@/lib/services/parts";
import { startOfIstDay } from "@/lib/time";

const visitSelect = {
  id: true,
  status: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  flat: { select: { tower: true, number: true, community: { select: { name: true, unitLabel: true } } } },
  round: { select: { title: true, service: { select: { name: true } } } },
  booking: { select: { problemNote: true, photo: { select: { id: true } } } },
  partsRequests: { select: { status: true } },
} as const;

/**
 * A technician's own visits: only those assigned to them, never another technician's or vendor's.
 * "today" is the IST day; "upcoming" the next two weeks after it.
 */
export async function technicianVisits(technicianId: string, range: "today" | "upcoming", now: Date) {
  const today = startOfIstDay(now);
  const tomorrow = startOfIstDay(now, 1);
  const window = range === "today" ? { gte: today, lt: tomorrow } : { gte: tomorrow, lt: startOfIstDay(now, 15) };
  return prisma.serviceVisit.findMany({
    where: { technicianId, startsAt: window, status: { not: "CANCELLED" } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: visitSelect,
  });
}

export type TechnicianVisit = Awaited<ReturnType<typeof technicianVisits>>[number];

/** One of the technician's visits, with what's wrong, the parts asked for and what can be done next. */
export async function technicianVisit(technicianId: string, visitId: string) {
  const visit = await prisma.serviceVisit.findFirst({
    where: { id: visitId, technicianId },
    select: {
      ...visitSelect,
      codeAttempts: true,
      onTheWayAt: true,
      startedAt: true,
      completedAt: true,
      noAccessAt: true,
      round: { select: { id: true, title: true, service: { select: { name: true } } } },
      booking: { select: { problemNote: true, photo: { select: { id: true, width: true, height: true } } } },
      partsRequests: { orderBy: { createdAt: "asc" }, select: { id: true, status: true, items: true, totalPaise: true, createdAt: true, decidedAt: true } },
    },
  });
  if (!visit) return null;
  const requests = visit.partsRequests.map((r) => ({ ...r, items: readParts(r.items) }));
  return {
    ...visit,
    partsRequests: requests,
    partsPaidPaise: partsTotal(requests.filter((r) => r.status === "APPROVED").flatMap((r) => r.items)),
    actions: partsActions(visit.status, requests),
    codeAttemptsLeft: Math.max(0, MAX_CODE_ATTEMPTS - visit.codeAttempts),
  };
}

export type TechnicianVisitDetail = NonNullable<Awaited<ReturnType<typeof technicianVisit>>>;

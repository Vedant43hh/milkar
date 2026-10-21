import "server-only";
import { prisma } from "@/lib/db";
import { startOfIstDay } from "@/lib/time";

const visitSelect = {
  id: true,
  status: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  flat: { select: { tower: true, number: true, community: { select: { name: true, unitLabel: true } } } },
  round: { select: { title: true, service: { select: { name: true } } } },
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

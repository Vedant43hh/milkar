import "server-only";
import { prisma } from "@/lib/db";
import { startOfIstDay } from "@/lib/time";
import { vendorEarnings } from "./vendor-orders";

// The vendor's overview: today's jobs, orders waiting for them, grocery drops coming up, earnings.

export async function getVendorHome(vendorId: string, now: Date) {
  const today = { gte: startOfIstDay(now), lt: startOfIstDay(now, 1) };
  const [vendor, todays, deliveries, earnings] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { name: true, ratingCount: true, ratingSum: true, verificationStatus: true } }),
    prisma.serviceVisit.findMany({ where: { round: { vendorId }, startsAt: today, status: { not: "CANCELLED" } }, select: { status: true, technicianId: true } }),
    prisma.vendorOrder.findMany({
      where: { vendorId, round: { kind: "GROCERY", status: "FINALIZED", deliveryAt: { gte: startOfIstDay(now) } } },
      orderBy: { round: { deliveryAt: "asc" } },
      take: 5,
      select: { id: true, number: true, status: true, totalPaise: true, round: { select: { title: true, deliveryAt: true, community: { select: { name: true } } } } },
    }),
    vendorEarnings(vendorId, now),
  ]);
  return {
    vendor,
    today: {
      visits: todays.length,
      done: todays.filter((v) => v.status === "COMPLETED" || v.status === "NO_ACCESS").length,
      unassigned: todays.filter((v) => v.technicianId === null && v.status === "SCHEDULED").length,
    },
    toAcknowledge: earnings.orders.filter((o) => o.status === "ISSUED").slice(0, 5),
    deliveries,
    earnings: { ...earnings.summary, thisMonthPaise: earnings.thisMonthPaise },
  };
}

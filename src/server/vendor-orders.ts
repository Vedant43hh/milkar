import "server-only";
import { prisma } from "@/lib/db";
import { earningsSummary, vendorPayout } from "@/lib/vendor/payout";
import { startOfIstMonth } from "@/lib/time";
import { runsVendor, type VendorActor } from "./vendor-actor";

// A vendor's orders: one per round they supply, issued at cutoff. Only ever their own.

const orderSummary = {
  id: true,
  number: true,
  status: true,
  subtotalPaise: true,
  gstPaise: true,
  totalPaise: true,
  createdAt: true,
  acknowledgedAt: true,
  paidAt: true,
  adjustments: { select: { type: true, amountPaise: true } },
  round: {
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      deliveryAt: true,
      community: { select: { name: true, city: true } },
      service: { select: { name: true } },
      slots: { orderBy: { startsAt: "asc" }, select: { startsAt: true } },
    },
  },
} as const;

function withPayout<T extends { totalPaise: number; adjustments: { type: "NO_ACCESS_FEE" | "VISIT_CANCELLED" | "ISSUE_REFUND" | "PARTS"; amountPaise: number }[]; round: { slots: { startsAt: Date }[] } }>(order: T) {
  const { slots, ...round } = order.round;
  return {
    ...order,
    round: { ...round, firstDay: slots[0]?.startsAt ?? null, lastDay: slots.at(-1)?.startsAt ?? null },
    payout: vendorPayout(order),
  };
}

/** Newest first. */
export async function listVendorOrders(vendorId: string) {
  const orders = await prisma.vendorOrder.findMany({ where: { vendorId }, orderBy: [{ createdAt: "desc" }, { number: "desc" }], select: orderSummary });
  return orders.map(withPayout);
}

export type VendorOrderRow = Awaited<ReturnType<typeof listVendorOrders>>[number];

/** One of the vendor's orders in full, or null (another vendor's looks the same as none). */
export async function getVendorOrder(vendorId: string, orderId: string) {
  const order = await prisma.vendorOrder.findFirst({
    where: { id: orderId, vendorId },
    select: {
      ...orderSummary,
      vendor: { select: { name: true, gstin: true, phone: true, city: true } },
      round: {
        select: {
          ...orderSummary.round.select,
          community: { select: { name: true, address: true, city: true, pincode: true } },
          visits: { where: { kind: "STANDARD" }, select: { status: true } },
        },
      },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          vendorPricePaise: true,
          gstBps: true,
          taxablePaise: true,
          gstPaise: true,
          lineTotalPaise: true,
          product: { select: { name: true, unit: true, packSize: true } },
          serviceOption: { select: { name: true, unitLabel: true } },
        },
      },
      adjustments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, amountPaise: true, note: true, createdAt: true, visit: { select: { flat: { select: { tower: true, number: true } } } } },
      },
    },
  });
  if (!order) return null;
  const { visits, ...round } = order.round;
  const sorted = [...order.lines].sort((a, b) => (a.product?.name ?? a.serviceOption?.name ?? "").localeCompare(b.product?.name ?? b.serviceOption?.name ?? ""));
  return { ...withPayout({ ...order, round }), lines: sorted, visits: { total: visits.length, done: visits.filter((v) => v.status === "COMPLETED").length } };
}

export type VendorOrderDetail = NonNullable<Awaited<ReturnType<typeof getVendorOrder>>>;

export type AcknowledgeError = "FORBIDDEN" | "NOT_FOUND";

/** The vendor confirms they've seen the order and will deliver. Saying it twice changes nothing. */
export async function acknowledgeVendorOrder(actor: VendorActor, orderId: string, now: Date): Promise<{ ok: true; changed: boolean } | { ok: false; error: AcknowledgeError }> {
  const vendorId = runsVendor(actor);
  if (!vendorId) return { ok: false, error: "FORBIDDEN" };
  const { count } = await prisma.vendorOrder.updateMany({ where: { id: orderId, vendorId, status: "ISSUED" }, data: { status: "ACKNOWLEDGED", acknowledgedAt: now } });
  if (count === 1) return { ok: true, changed: true };
  const exists = await prisma.vendorOrder.count({ where: { id: orderId, vendorId } });
  return exists ? { ok: true, changed: false } : { ok: false, error: "NOT_FOUND" };
}

/** What the vendor has earned: owed and paid overall, this month's payouts, and each order's. */
export async function vendorEarnings(vendorId: string, now: Date) {
  const orders = await listVendorOrders(vendorId);
  const monthStart = startOfIstMonth(now);
  const thisMonth = orders.filter((o) => o.createdAt >= monthStart);
  return {
    orders,
    summary: earningsSummary(orders.map((o) => ({ status: o.status, payoutPaise: o.payout.payoutPaise }))),
    thisMonthPaise: thisMonth.reduce((s, o) => s + o.payout.payoutPaise, 0),
  };
}

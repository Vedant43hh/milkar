import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEnter } from "@/lib/auth/rules";
import { formatIST } from "@/lib/time";
import { purchaseOrderCsv } from "@/lib/vendor/purchase-order";
import { getVendorOrder } from "@/server/vendor-orders";
import { lineName } from "@/components/vendor/order-text";

/**
 * A vendor's order as CSV, for a spreadsheet or their billing software. Only the vendor's own
 * account gets it; anyone else gets the same 404 as for an order that doesn't exist.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/vendor/orders/[orderId]/csv">) {
  const { orderId } = await params;
  const user = await getCurrentUser();
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!user || !user.vendor || user.role !== "VENDOR" || !canEnter(user, "vendor")) return notFound();
  const order = await getVendorOrder(user.vendor.id, orderId);
  if (!order) return notFound();
  const { round } = order;
  const deliverBy =
    round.kind === "GROCERY" ? formatIST(round.deliveryAt) : round.firstDay && round.lastDay ? `${formatIST(round.firstDay, "date")} to ${formatIST(round.lastDay, "date")}` : "";
  const csv = purchaseOrderCsv({
    number: order.number,
    round: round.title,
    community: `${round.community.name}, ${round.community.address}, ${round.community.city} ${round.community.pincode}`,
    deliverBy,
    lines: order.lines.map((l) => ({ ...lineName(l), quantity: l.quantity, vendorPricePaise: l.vendorPricePaise, gstBps: l.gstBps, taxablePaise: l.taxablePaise, gstPaise: l.gstPaise, lineTotalPaise: l.lineTotalPaise })),
    subtotalPaise: order.subtotalPaise,
    gstPaise: order.gstPaise,
    totalPaise: order.totalPaise,
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="milkar-PO-${order.number}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import { t } from "@/i18n";
import { formatIST } from "@/lib/time";
import type { VendorOrderDetail, VendorOrderRow } from "@/server/vendor-orders";

/** When the work happens: the grocery delivery, or the Service Day's days. */
export function whenText(round: VendorOrderRow["round"]): string {
  if (round.kind === "GROCERY") return t("vendorOrders.deliverBy", { when: formatIST(round.deliveryAt) });
  if (!round.firstDay || !round.lastDay) return "";
  const from = formatIST(round.firstDay, "date");
  const to = formatIST(round.lastDay, "date");
  return from === to ? t("vendorOrders.visitsOnDay", { day: from }) : t("vendorOrders.visitsOn", { from, to });
}

/** "Basmati rice", "1 kg"; or "Split AC", "Per unit". */
export function lineName(line: VendorOrderDetail["lines"][number]): { item: string; detail: string } {
  if (line.product) return { item: line.product.name, detail: t(`vendorOrders.unit.${line.product.unit}`, { n: line.product.packSize }) };
  return { item: line.serviceOption?.name ?? "", detail: t("vendorOrders.perOption", { unit: line.serviceOption?.unitLabel ?? "" }) };
}

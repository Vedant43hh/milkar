import { applyBps } from "./money";

export type ConfirmedOffering = {
  offeringId: string;
  /** Exactly one of productId / serviceOptionId is set. */
  productId: string | null;
  serviceOptionId: string | null;
  vendorId: string;
  totalQty: number;
  vendorPricePaise: number;
  gstBps: number;
};

export type VendorOrderDraft = {
  vendorId: string;
  lines: {
    offeringId: string;
    productId: string | null;
    serviceOptionId: string | null;
    quantity: number;
    vendorPricePaise: number;
    gstBps: number;
    taxablePaise: number;
    gstPaise: number;
    lineTotalPaise: number;
  }[];
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
};

/**
 * One order per vendor (a purchase order for goods, a job sheet for services), priced at the
 * vendor's tier price plus GST.
 */
export function buildVendorOrders(offerings: readonly ConfirmedOffering[]): VendorOrderDraft[] {
  const byVendor = new Map<string, VendorOrderDraft>();
  for (const o of offerings) {
    if (o.totalQty <= 0) continue;
    let order = byVendor.get(o.vendorId);
    if (!order) {
      order = { vendorId: o.vendorId, lines: [], subtotalPaise: 0, gstPaise: 0, totalPaise: 0 };
      byVendor.set(o.vendorId, order);
    }
    const taxablePaise = o.totalQty * o.vendorPricePaise;
    const gstPaise = applyBps(taxablePaise, o.gstBps);
    order.lines.push({
      offeringId: o.offeringId,
      productId: o.productId,
      serviceOptionId: o.serviceOptionId,
      quantity: o.totalQty,
      vendorPricePaise: o.vendorPricePaise,
      gstBps: o.gstBps,
      taxablePaise,
      gstPaise,
      lineTotalPaise: taxablePaise + gstPaise,
    });
    order.subtotalPaise += taxablePaise;
    order.gstPaise += gstPaise;
    order.totalPaise += taxablePaise + gstPaise;
  }
  return [...byVendor.values()].sort((a, b) => a.vendorId.localeCompare(b.vendorId));
}

export type PackingInput = {
  flatId: string;
  tower: string;
  flatNumber: string;
  productId: string;
  productName: string;
  quantity: number;
};

export type FlatPacking = {
  flatId: string;
  tower: string;
  flatNumber: string;
  items: { productId: string; productName: string; quantity: number }[];
  totalUnits: number;
};

const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Per-flat packing list. Family members in the same flat are combined. Sorted by tower then flat. */
export function buildPackingList(rows: readonly PackingInput[]): FlatPacking[] {
  const byFlat = new Map<string, FlatPacking>();
  for (const row of rows) {
    if (row.quantity <= 0) continue;
    let flat = byFlat.get(row.flatId);
    if (!flat) {
      flat = { flatId: row.flatId, tower: row.tower, flatNumber: row.flatNumber, items: [], totalUnits: 0 };
      byFlat.set(row.flatId, flat);
    }
    const existing = flat.items.find((i) => i.productId === row.productId);
    if (existing) existing.quantity += row.quantity;
    else flat.items.push({ productId: row.productId, productName: row.productName, quantity: row.quantity });
    flat.totalUnits += row.quantity;
  }
  const flats = [...byFlat.values()];
  for (const flat of flats) flat.items.sort((a, b) => natural.compare(a.productName, b.productName));
  return flats.sort(
    (a, b) => natural.compare(a.tower, b.tower) || natural.compare(a.flatNumber, b.flatNumber),
  );
}

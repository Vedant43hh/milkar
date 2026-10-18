import { applyBps } from "./money";

export type ConfirmedProduct = {
  roundProductId: string;
  productId: string;
  supplierId: string;
  totalQty: number;
  supplierPricePaise: number;
  gstBps: number;
};

export type PurchaseOrderDraft = {
  supplierId: string;
  lines: {
    roundProductId: string;
    productId: string;
    quantity: number;
    supplierPricePaise: number;
    gstBps: number;
    taxablePaise: number;
    gstPaise: number;
    lineTotalPaise: number;
  }[];
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
};

/** One purchase order per supplier, priced at the supplier's tier price plus GST. */
export function buildPurchaseOrders(products: readonly ConfirmedProduct[]): PurchaseOrderDraft[] {
  const bySupplier = new Map<string, PurchaseOrderDraft>();
  for (const p of products) {
    if (p.totalQty <= 0) continue;
    let po = bySupplier.get(p.supplierId);
    if (!po) {
      po = { supplierId: p.supplierId, lines: [], subtotalPaise: 0, gstPaise: 0, totalPaise: 0 };
      bySupplier.set(p.supplierId, po);
    }
    const taxablePaise = p.totalQty * p.supplierPricePaise;
    const gstPaise = applyBps(taxablePaise, p.gstBps);
    po.lines.push({
      roundProductId: p.roundProductId,
      productId: p.productId,
      quantity: p.totalQty,
      supplierPricePaise: p.supplierPricePaise,
      gstBps: p.gstBps,
      taxablePaise,
      gstPaise,
      lineTotalPaise: taxablePaise + gstPaise,
    });
    po.subtotalPaise += taxablePaise;
    po.gstPaise += gstPaise;
    po.totalPaise += taxablePaise + gstPaise;
  }
  return [...bySupplier.values()].sort((a, b) => a.supplierId.localeCompare(b.supplierId));
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

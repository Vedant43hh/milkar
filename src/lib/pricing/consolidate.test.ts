import { describe, expect, it } from "vitest";
import { buildPackingList, buildPurchaseOrders } from "./consolidate";

describe("buildPurchaseOrders", () => {
  it("creates one PO per supplier with GST on the supplier price", () => {
    const pos = buildPurchaseOrders([
      { roundProductId: "rp1", productId: "rice", supplierId: "s1", totalQty: 57, supplierPricePaise: 40684, gstBps: 500 },
      { roundProductId: "rp2", productId: "soap", supplierId: "s2", totalQty: 10, supplierPricePaise: 15000, gstBps: 1800 },
      { roundProductId: "rp3", productId: "dal", supplierId: "s1", totalQty: 20, supplierPricePaise: 14000, gstBps: 500 },
      { roundProductId: "rp4", productId: "none", supplierId: "s3", totalQty: 0, supplierPricePaise: 100, gstBps: 0 },
    ]);
    expect(pos.map((p) => p.supplierId)).toEqual(["s1", "s2"]);
    const [s1, s2] = pos;
    expect(s1.lines).toHaveLength(2);
    expect(s1.lines[0]).toEqual({
      roundProductId: "rp1",
      productId: "rice",
      quantity: 57,
      supplierPricePaise: 40684,
      gstBps: 500,
      taxablePaise: 57 * 40684,
      gstPaise: 115949, // 5% of 23,18,988 paise = 115949.4
      lineTotalPaise: 57 * 40684 + 115949,
    });
    expect(s1.subtotalPaise).toBe(57 * 40684 + 20 * 14000);
    expect(s1.totalPaise).toBe(s1.subtotalPaise + s1.gstPaise);
    expect(s2).toMatchObject({ subtotalPaise: 150000, gstPaise: 27000, totalPaise: 177000 });
  });
});

describe("buildPackingList", () => {
  it("combines family members, skips empty rows, and sorts by tower and flat", () => {
    const list = buildPackingList([
      { flatId: "b402", tower: "B", flatNumber: "402", productId: "rice", productName: "Rice 5 kg", quantity: 2 },
      { flatId: "a1001", tower: "A", flatNumber: "1001", productId: "dal", productName: "Toor dal 1 kg", quantity: 1 },
      { flatId: "a101", tower: "A", flatNumber: "101", productId: "rice", productName: "Rice 5 kg", quantity: 1 },
      { flatId: "b402", tower: "B", flatNumber: "402", productId: "rice", productName: "Rice 5 kg", quantity: 1 },
      { flatId: "b402", tower: "B", flatNumber: "402", productId: "atta", productName: "Atta 10 kg", quantity: 1 },
      { flatId: "c1", tower: "C", flatNumber: "1", productId: "atta", productName: "Atta 10 kg", quantity: 0 },
    ]);
    expect(list.map((f) => `${f.tower}-${f.flatNumber}`)).toEqual(["A-101", "A-1001", "B-402"]);
    expect(list[2]).toEqual({
      flatId: "b402",
      tower: "B",
      flatNumber: "402",
      items: [
        { productId: "atta", productName: "Atta 10 kg", quantity: 1 },
        { productId: "rice", productName: "Rice 5 kg", quantity: 3 },
      ],
      totalUnits: 4,
    });
  });
});

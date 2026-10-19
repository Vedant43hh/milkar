import { describe, expect, it } from "vitest";
import { buildPackingList, buildVendorOrders } from "./consolidate";

describe("buildVendorOrders", () => {
  it("creates one order per vendor with GST on the vendor price", () => {
    const goods = (offeringId: string, productId: string, vendorId: string, totalQty: number, vendorPricePaise: number, gstBps: number) => ({
      offeringId,
      productId,
      serviceOptionId: null,
      vendorId,
      totalQty,
      vendorPricePaise,
      gstBps,
    });
    const orders = buildVendorOrders([
      goods("rp1", "rice", "s1", 57, 40684, 500),
      goods("rp2", "soap", "s2", 10, 15000, 1800),
      goods("rp3", "dal", "s1", 20, 14000, 500),
      goods("rp4", "none", "s3", 0, 100, 0),
    ]);
    expect(orders.map((o) => o.vendorId)).toEqual(["s1", "s2"]);
    const [s1, s2] = orders;
    expect(s1.lines).toHaveLength(2);
    expect(s1.lines[0]).toEqual({
      offeringId: "rp1",
      productId: "rice",
      serviceOptionId: null,
      quantity: 57,
      vendorPricePaise: 40684,
      gstBps: 500,
      taxablePaise: 57 * 40684,
      gstPaise: 115949, // 5% of 23,18,988 paise = 115949.4
      lineTotalPaise: 57 * 40684 + 115949,
    });
    expect(s1.subtotalPaise).toBe(57 * 40684 + 20 * 14000);
    expect(s1.totalPaise).toBe(s1.subtotalPaise + s1.gstPaise);
    expect(s2).toMatchObject({ subtotalPaise: 150000, gstPaise: 27000, totalPaise: 177000 });
  });

  it("builds a service vendor's job sheet from its options", () => {
    const [order] = buildVendorOrders([
      { offeringId: "split", productId: null, serviceOptionId: "opt-split", vendorId: "coolcare", totalQty: 21, vendorPricePaise: 45000, gstBps: 1800 },
      { offeringId: "window", productId: null, serviceOptionId: "opt-window", vendorId: "coolcare", totalQty: 4, vendorPricePaise: 45000, gstBps: 1800 },
    ]);
    expect(order.lines.map((l) => [l.serviceOptionId, l.quantity])).toEqual([
      ["opt-split", 21],
      ["opt-window", 4],
    ]);
    expect(order.subtotalPaise).toBe(25 * 45000);
    expect(order.gstPaise).toBe(170100 + 32400);
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

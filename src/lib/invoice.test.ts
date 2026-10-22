import { describe, expect, it } from "vitest";
import { buildInvoice, invoiceNumber, stateFromGstin, stateFromPincode, type InvoiceInput } from "./invoice";

const base: InvoiceInput = {
  number: "MLK-7-ABC123",
  date: new Date("2026-10-12T14:31:00Z"),
  supplier: { name: "Milkar", gstin: "27AAACM1234F1Z5", address: "Pune" },
  buyer: { name: "Rahul Deshmukh", address: "Flat A-101, Green Meadows CHS", pincode: "411045" },
  lines: [
    { description: "Sona Masoori Rice 5 kg", quantity: 2, amountPaise: 2 * 46200, gstBps: 500 },
    { description: "Detergent Powder 4 kg", quantity: 1, amountPaise: 54044, gstBps: 1800 },
    { description: "Farm Eggs", quantity: 3, amountPaise: 3 * 8136, gstBps: 0 },
  ],
};

describe("buildInvoice", () => {
  it("splits each line into taxable value and GST that add back to what was paid", () => {
    const invoice = buildInvoice(base);
    for (const line of invoice.lines) {
      expect(line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise).toBe(line.amountPaise);
    }
    expect(invoice.totals.totalPaise).toBe(2 * 46200 + 54044 + 3 * 8136);
    expect(invoice.totals.taxablePaise + invoice.totals.gstPaise).toBe(invoice.totals.totalPaise);
  });

  it("charges CGST and SGST, half each, inside the supplier's state", () => {
    const invoice = buildInvoice(base);
    expect(invoice.interState).toBe(false);
    expect(invoice.placeOfSupply).toEqual({ code: "27", name: "Maharashtra" });
    const rice = invoice.lines[0];
    expect(rice).toMatchObject({ unitPaise: 46200, taxablePaise: 88000, cgstPaise: 2200, sgstPaise: 2200, igstPaise: 0 });
    const detergent = invoice.lines[1];
    // ₹540.44 at 18%: taxable ₹458.00, GST ₹82.44, split ₹41.22 + ₹41.22
    expect(detergent).toMatchObject({ taxablePaise: 45800, cgstPaise: 4122, sgstPaise: 4122 });
    expect(invoice.totals.igstPaise).toBe(0);
  });

  it("puts an odd paisa of GST in SGST so the halves always add up", () => {
    const invoice = buildInvoice({ ...base, lines: [{ description: "Odd", quantity: 1, amountPaise: 10501, gstBps: 500 }] });
    const [line] = invoice.lines;
    expect(line.cgstPaise + line.sgstPaise).toBe(10501 - line.taxablePaise);
    expect(line.sgstPaise - line.cgstPaise).toBeGreaterThanOrEqual(0);
    expect(line.sgstPaise - line.cgstPaise).toBeLessThanOrEqual(1);
  });

  it("charges IGST when the buyer is in another state", () => {
    const invoice = buildInvoice({ ...base, buyer: { ...base.buyer, pincode: "560095" } });
    expect(invoice.interState).toBe(true);
    expect(invoice.placeOfSupply?.name).toBe("Karnataka");
    expect(invoice.totals.cgstPaise + invoice.totals.sgstPaise).toBe(0);
    expect(invoice.totals.igstPaise).toBe(invoice.totals.gstPaise);
  });

  it("falls back to CGST and SGST when Milkar's GSTIN isn't set", () => {
    const invoice = buildInvoice({ ...base, supplier: { ...base.supplier, gstin: null }, buyer: { ...base.buyer, pincode: "560095" } });
    expect(invoice.interState).toBe(false);
    expect(invoice.supplierState).toBeNull();
  });

  it("summarises GST per rate, with zero-rated items at 0%", () => {
    const invoice = buildInvoice(base);
    expect(invoice.byRate.map((r) => r.gstBps)).toEqual([0, 500, 1800]);
    expect(invoice.byRate[0]).toEqual({ gstBps: 0, taxablePaise: 3 * 8136, gstPaise: 0 });
    expect(invoice.byRate.reduce((s, r) => s + r.taxablePaise + r.gstPaise, 0)).toBe(invoice.totals.totalPaise);
  });

  it("is empty but valid with no lines", () => {
    const invoice = buildInvoice({ ...base, lines: [] });
    expect(invoice.totals).toEqual({ taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, gstPaise: 0, totalPaise: 0 });
    expect(invoice.byRate).toEqual([]);
  });
});

describe("states", () => {
  it("reads the state from a GSTIN's first two digits", () => {
    expect(stateFromGstin("29ABCDE1234F1Z5")).toEqual({ code: "29", name: "Karnataka" });
    expect(stateFromGstin("")).toBeNull();
    expect(stateFromGstin(null)).toBeNull();
    expect(stateFromGstin("99ABCDE1234F1Z5")).toBeNull();
  });

  it("finds the state from a pincode's postal circle", () => {
    expect(stateFromPincode("411045")?.name).toBe("Maharashtra");
    expect(stateFromPincode("110001")?.name).toBe("Delhi");
    expect(stateFromPincode("600001")?.name).toBe("Tamil Nadu");
    expect(stateFromPincode("500081")?.name).toBe("Telangana");
    expect(stateFromPincode("012345")).toBeNull();
    expect(stateFromPincode("4110")).toBeNull();
  });
});

describe("invoiceNumber", () => {
  it("combines the round number with the end of the buyer's id", () => {
    expect(invoiceNumber(12, "cmabc0000xyz9q4z")).toBe("MLK-12-YZ9Q4Z");
  });
});

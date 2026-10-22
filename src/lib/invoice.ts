// GST invoices for what a resident bought in a round. Pure.
//
// Milkar sells to residents: the vendor's price plus Milkar's margin is the taxable value, and GST
// is charged on it. So the invoice is Milkar's, for the final GST-inclusive amounts fixed at
// cutoff. Each line is split into taxable value and GST with splitInclusive, like the rest of the
// pricing code. Inside the supplier's own state GST is CGST + SGST (half each); to another state
// it is IGST. The buyer's state comes from the delivery pincode.
import { splitInclusive } from "./pricing/price";

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  /** Final amount for the line, GST included. */
  amountPaise: number;
  gstBps: number;
};

export type InvoiceInput = {
  number: string;
  date: Date;
  supplier: { name: string; gstin: string | null; address: string };
  buyer: { name: string; address: string; pincode: string };
  lines: readonly InvoiceLineInput[];
};

export type InvoiceLine = InvoiceLineInput & {
  /** GST-inclusive price per unit. */
  unitPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

export type InvoiceTotals = { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; gstPaise: number; totalPaise: number };

export type Invoice = Omit<InvoiceInput, "lines"> & {
  supplierState: GstState | null;
  placeOfSupply: GstState | null;
  /** IGST instead of CGST + SGST. */
  interState: boolean;
  lines: InvoiceLine[];
  /** One row per GST rate, as on a printed tax summary. */
  byRate: { gstBps: number; taxablePaise: number; gstPaise: number }[];
  totals: InvoiceTotals;
};

export type GstState = { code: string; name: string };

const STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "36": "Telangana",
  "37": "Andhra Pradesh",
};

/** GST state code by the first two digits of a pincode (the postal circle). Covers the main circles. */
const PIN_PREFIX_STATE: [from: number, to: number, code: string][] = [
  [11, 11, "07"],
  [12, 13, "06"],
  [14, 16, "03"],
  [17, 17, "02"],
  [18, 19, "01"],
  [20, 28, "09"],
  [30, 34, "08"],
  [36, 39, "24"],
  [40, 44, "27"],
  [45, 48, "23"],
  [49, 49, "22"],
  [50, 50, "36"],
  [51, 53, "37"],
  [56, 59, "29"],
  [60, 64, "33"],
  [67, 69, "32"],
  [70, 74, "19"],
  [75, 77, "21"],
  [78, 78, "18"],
  [80, 81, "10"],
  [82, 83, "20"],
  [84, 85, "10"],
];

const state = (code: string): GstState | null => (STATE_NAMES[code] ? { code, name: STATE_NAMES[code] } : null);

export function stateFromGstin(gstin: string | null | undefined): GstState | null {
  return gstin && /^\d{2}/.test(gstin) ? state(gstin.slice(0, 2)) : null;
}

export function stateFromPincode(pincode: string): GstState | null {
  if (!/^[1-9]\d{5}$/.test(pincode)) return null;
  const prefix = Number(pincode.slice(0, 2));
  const match = PIN_PREFIX_STATE.find(([from, to]) => prefix >= from && prefix <= to);
  return match ? state(match[2]) : null;
}

export function buildInvoice(input: InvoiceInput): Invoice {
  const supplierState = stateFromGstin(input.supplier.gstin);
  const placeOfSupply = stateFromPincode(input.buyer.pincode);
  // Without both states we can't tell, and CGST + SGST is the common case for a local platform.
  const interState = supplierState !== null && placeOfSupply !== null && supplierState.code !== placeOfSupply.code;

  const lines = input.lines.map((line): InvoiceLine => {
    const { taxablePaise, gstPaise } = splitInclusive(line.amountPaise, line.gstBps);
    const cgstPaise = interState ? 0 : Math.floor(gstPaise / 2);
    return {
      ...line,
      unitPaise: line.quantity > 0 ? Math.round(line.amountPaise / line.quantity) : 0,
      taxablePaise,
      cgstPaise,
      sgstPaise: interState ? 0 : gstPaise - cgstPaise,
      igstPaise: interState ? gstPaise : 0,
    };
  });

  const sum = (pick: (l: InvoiceLine) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const totals: InvoiceTotals = {
    taxablePaise: sum((l) => l.taxablePaise),
    cgstPaise: sum((l) => l.cgstPaise),
    sgstPaise: sum((l) => l.sgstPaise),
    igstPaise: sum((l) => l.igstPaise),
    gstPaise: sum((l) => l.cgstPaise + l.sgstPaise + l.igstPaise),
    totalPaise: sum((l) => l.amountPaise),
  };

  const rates = [...new Set(lines.map((l) => l.gstBps))].sort((a, b) => a - b);
  const byRate = rates.map((gstBps) => {
    const at = lines.filter((l) => l.gstBps === gstBps);
    return { gstBps, taxablePaise: at.reduce((s, l) => s + l.taxablePaise, 0), gstPaise: at.reduce((s, l) => s + l.cgstPaise + l.sgstPaise + l.igstPaise, 0) };
  });

  return { number: input.number, date: input.date, supplier: input.supplier, buyer: input.buyer, supplierState, placeOfSupply, interState, lines, byRate, totals };
}

/** "MLK-12-7Q4XZA": the round's number and a stable part of the buyer's id. */
export function invoiceNumber(roundNumber: number, userId: string): string {
  return `MLK-${roundNumber}-${userId.slice(-6).toUpperCase()}`;
}

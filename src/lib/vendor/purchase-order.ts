// A vendor order as a CSV file a vendor can open in a spreadsheet or import. Pure.

import { formatBps } from "../pricing/money";

export type PurchaseOrderLine = {
  item: string;
  /** "5 kg bag", "Split AC (per unit)". */
  detail: string;
  quantity: number;
  vendorPricePaise: number;
  gstBps: number;
  taxablePaise: number;
  gstPaise: number;
  lineTotalPaise: number;
};

export type PurchaseOrderCsvInput = {
  number: number;
  round: string;
  community: string;
  /** Already formatted, e.g. "27 Oct 2026, 10:00 am". */
  deliverBy: string;
  lines: readonly PurchaseOrderLine[];
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
};

/** Rupees with two decimals and no symbol or grouping, so spreadsheets read them as numbers. */
export function csvRupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Quotes a field when it holds a comma, quote or line break, and defuses spreadsheet formulas. */
export function csvField(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function purchaseOrderCsv(po: PurchaseOrderCsvInput): string {
  const rows: (string | number)[][] = [
    ["Purchase order", `PO-${po.number}`],
    ["Round", po.round],
    ["Community", po.community],
    ["Deliver by", po.deliverBy],
    [],
    ["Item", "Pack or option", "Quantity", "Unit price (₹, excl. GST)", "GST rate", "Taxable value (₹)", "GST (₹)", "Line total (₹)"],
    ...po.lines.map((l) => [l.item, l.detail, l.quantity, csvRupees(l.vendorPricePaise), formatBps(l.gstBps), csvRupees(l.taxablePaise), csvRupees(l.gstPaise), csvRupees(l.lineTotalPaise)]),
    [],
    ["", "", "", "", "Subtotal", csvRupees(po.subtotalPaise)],
    ["", "", "", "", "GST", "", csvRupees(po.gstPaise)],
    ["", "", "", "", "Total", "", "", csvRupees(po.totalPaise)],
  ];
  // CRLF line endings and a byte-order mark, so Excel opens it as UTF-8 (₹ and names intact).
  return "﻿" + rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

// Parts for a repair visit, and what the visit costs the flat in the end. Pure.
//
// While a job is in progress the technician lists the parts it needs, at actual cost (GST
// included). The resident approves, which pays for them, or declines and the technician carries on
// without. While a request waits, the visit can't be completed and no other parts can be asked
// for. Parts paid for but not used, or a visit cancelled, go back to the wallet.

export type PartsItem = { name: string; qty: number; unitPaise: number };
export type PartsStatus = "PENDING" | "APPROVED" | "DECLINED" | "REFUNDED";

export const MAX_PARTS_ITEMS = 10;
export const MAX_PART_QTY = 20;
export const MAX_PART_UNIT_PAISE = 50_000_00; // ₹50,000
export const MAX_PARTS_TOTAL_PAISE = 1_00_000_00; // ₹1,00,000
/** GST on parts, inside the prices the technician enters; used to split them on the invoice. */
export const PARTS_GST_BPS = 1800;

export type PartsError = "NO_ITEMS" | "TOO_MANY_ITEMS" | "INVALID_ITEM" | "TOO_EXPENSIVE";

/** Checks what the technician typed: 1–10 parts, each named, 1–20 of them, ₹1–₹50,000 each. */
export function checkParts(items: readonly { name: unknown; qty: unknown; unitPaise: unknown }[]): { ok: true; items: PartsItem[]; totalPaise: number } | { ok: false; error: PartsError } {
  const filled = items.filter((i) => !(String(i.name ?? "").trim() === "" && !i.qty && !i.unitPaise));
  if (filled.length === 0) return { ok: false, error: "NO_ITEMS" };
  if (filled.length > MAX_PARTS_ITEMS) return { ok: false, error: "TOO_MANY_ITEMS" };
  const clean: PartsItem[] = [];
  for (const raw of filled) {
    const name = String(raw.name ?? "").trim();
    const qty = Number(raw.qty);
    const unitPaise = Number(raw.unitPaise);
    if (name.length < 2 || name.length > 60) return { ok: false, error: "INVALID_ITEM" };
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_PART_QTY) return { ok: false, error: "INVALID_ITEM" };
    if (!Number.isInteger(unitPaise) || unitPaise < 100 || unitPaise > MAX_PART_UNIT_PAISE) return { ok: false, error: "INVALID_ITEM" };
    clean.push({ name, qty, unitPaise });
  }
  const totalPaise = partsTotal(clean);
  if (totalPaise > MAX_PARTS_TOTAL_PAISE) return { ok: false, error: "TOO_EXPENSIVE" };
  return { ok: true, items: clean, totalPaise };
}

export function partsTotal(items: readonly PartsItem[]): number {
  return items.reduce((s, i) => s + i.qty * i.unitPaise, 0);
}

/** Stored JSON back into parts, leaving out anything malformed. */
export function readParts(json: unknown): PartsItem[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((i): i is PartsItem => typeof i === "object" && i !== null && typeof i.name === "string" && Number.isInteger(i.qty) && Number.isInteger(i.unitPaise))
    .map((i) => ({ name: i.name, qty: i.qty, unitPaise: i.unitPaise }));
}

export type RepairBill = {
  /** The visit and labour at the group price. */
  visitPaise: number;
  /** Parts paid for and kept. */
  parts: PartsItem[];
  partsPaise: number;
  /** Parts waiting for the resident's answer: not in the total yet. */
  pendingPaise: number;
  totalPaise: number;
};

/** What a repair visit costs: the group-priced visit charge plus the parts that were paid for and used. */
export function repairBill(visitPaise: number, requests: readonly { status: PartsStatus; items: readonly PartsItem[] }[]): RepairBill {
  const approved = requests.filter((r) => r.status === "APPROVED");
  const parts = approved.flatMap((r) => r.items);
  const partsPaise = partsTotal(parts);
  const pendingPaise = requests.filter((r) => r.status === "PENDING").reduce((s, r) => s + partsTotal(r.items), 0);
  return { visitPaise, parts, partsPaise, pendingPaise, totalPaise: visitPaise + partsPaise };
}

/** What the technician may do about parts at this point of the visit. */
export function partsActions(visitStatus: string, requests: readonly { status: PartsStatus }[]): { canRequest: boolean; canComplete: boolean; waiting: boolean } {
  const waiting = requests.some((r) => r.status === "PENDING");
  return { canRequest: visitStatus === "IN_PROGRESS" && !waiting, canComplete: visitStatus === "IN_PROGRESS" && !waiting, waiting };
}

export const partsDebitKey = (paymentId: string) => `PARTS_DEBIT:${paymentId}`;
export const partsRefundKey = (requestId: string) => `PARTS_REFUND:${requestId}`;

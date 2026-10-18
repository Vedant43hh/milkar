// Shared test fixtures. Rice tiers reproduce the brief's example exactly:
// with a 3% margin and 5% GST, residents pay ₹500 (1–19 bags), ₹465 (20–49) and ₹440 (50+).
import type { Tier } from "./tiers";

export const MARGIN_BPS = 300;
export const RICE_GST_BPS = 500;

export const RICE_TIERS: Tier[] = [
  { minQty: 1, supplierPricePaise: 46232 },
  { minQty: 20, supplierPricePaise: 42996 },
  { minQty: 50, supplierPricePaise: 40684 },
];

export const RICE = {
  tiers: RICE_TIERS,
  marginBps: MARGIN_BPS,
  gstBps: RICE_GST_BPS,
  minOrderQty: 10,
  mrpPaise: 55000,
};

export const P500 = 50000;
export const P465 = 46500;
export const P440 = 44000;

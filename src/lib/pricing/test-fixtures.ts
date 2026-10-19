// Shared test fixtures. Rice tiers reproduce the brief's example exactly:
// with a 3% margin and 5% GST, residents pay ₹500 (1–19 bags), ₹465 (20–49) and ₹440 (50+).
import type { Tier } from "./tiers";

export const MARGIN_BPS = 300;
export const RICE_GST_BPS = 500;

export const RICE_TIERS: Tier[] = [
  { minQty: 1, vendorPricePaise: 46232 },
  { minQty: 20, vendorPricePaise: 42996 },
  { minQty: 50, vendorPricePaise: 40684 },
];

export const RICE = {
  tierBasis: "UNITS" as const,
  tiers: RICE_TIERS,
  marginBps: MARGIN_BPS,
  gstBps: RICE_GST_BPS,
  minOrderQty: 10,
  mrpPaise: 55000,
};

export const P500 = 50000;
export const P465 = 46500;
export const P440 = 44000;

// AC servicing, per unit, priced on flats booked: ₹699 (1–4 flats), ₹549 (5–19), ₹400 (20+), 18% GST,
// needing at least 5 flats.
export const AC_GST_BPS = 1800;
export const AC_TIERS: Tier[] = [
  { minQty: 1, vendorPricePaise: 57512 },
  { minQty: 5, vendorPricePaise: 45170 },
  { minQty: 20, vendorPricePaise: 32911 },
];
export const AC = {
  tierBasis: "FLATS" as const,
  tiers: AC_TIERS,
  marginBps: MARGIN_BPS,
  gstBps: AC_GST_BPS,
  minOrderQty: 5,
  mrpPaise: 89900,
};
export const P699 = 69900;
export const P549 = 54900;
export const P400 = 40000;

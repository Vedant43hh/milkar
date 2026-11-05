// What a vendor can put in their catalogue, and the checks on it. Pure.
//
// Prices are the vendor's own, GST excluded, per tier. Residents pay that plus Milkar's margin plus
// GST; for goods that must never be more than the MRP printed on the pack, which is the law.

import { isRepairService } from "../categories";
import { unitPrice } from "../pricing/price";
import { sortTiers, validateTiers, type Tier } from "../pricing/tiers";

/** GST slabs a vendor can pick: nil, 5% and 18%. */
export const GST_RATES_BPS = [0, 500, 1800] as const;

export const PRODUCT_CATEGORIES = ["GRAINS_FLOUR", "DALS_PULSES", "OILS_GHEE", "SUGAR_SALT", "SPICES", "TEA_COFFEE", "BREAKFAST", "HOME_CARE", "PERSONAL_CARE", "EGGS_DAIRY"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const UNITS = ["KG", "G", "LITRE", "ML", "PACKET", "PIECE", "DOZEN"] as const;
export type Unit = (typeof UNITS)[number];

export const SERVICE_CATEGORIES = ["AC", "RO", "DEEP_CLEANING", "PEST_CONTROL", "WATER_TANK", "CAR_WASH", "SOFA_CARPET", "CHIMNEY", "APPLIANCE_REPAIR", "PLUMBER", "ELECTRICIAN", "CARPENTER", "PAINTER"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export type VendorCategory = "GROCERIES" | "HOME_SERVICES" | "REPAIRS";

/** Groceries vendors list products. */
export function sellsProducts(categories: readonly VendorCategory[]): boolean {
  return categories.includes("GROCERIES");
}

/** The services a vendor may offer: upkeep for home-services vendors, repairs for repair vendors. */
export function allowedServiceCategories(categories: readonly VendorCategory[]): ServiceCategory[] {
  return SERVICE_CATEGORIES.filter((c) => (isRepairService(c) ? categories.includes("REPAIRS") : categories.includes("HOME_SERVICES")));
}

export type CatalogueProblem =
  | "NAME"
  | "CATEGORY"
  | "UNIT"
  | "PACK_SIZE"
  | "MRP"
  | "GST"
  | "MIN_ORDER"
  | "MAX_PER_FLAT"
  | "TIERS"
  | "ABOVE_MRP"
  | "DESCRIPTION"
  | "MIN_FLATS"
  | "FEE"
  | "DURATION"
  | "UNIT_LABEL";

const between = (n: number, min: number, max: number) => Number.isSafeInteger(n) && n >= min && n <= max;
const nameOk = (name: string, max = 80) => {
  const n = name.trim();
  return n.length >= 2 && n.length <= max;
};

/** Residents' price at the dearest tier (the first): what they'd pay with few others ordering. */
export function highestResidentPrice(tiers: readonly Tier[], marginBps: number, gstBps: number): number {
  const [first] = sortTiers(tiers);
  return first ? unitPrice(first.vendorPricePaise, marginBps, gstBps).totalPaise : 0;
}

export type ProductDraft = {
  name: string;
  category: string;
  unit: string;
  packSize: number;
  mrpPaise: number;
  gstBps: number;
  minOrderQty: number;
  maxPerFlat: number;
  tiers: Tier[];
};

export function checkProduct(d: ProductDraft, marginBps: number): CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  if (!nameOk(d.name)) problems.push("NAME");
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(d.category)) problems.push("CATEGORY");
  if (!(UNITS as readonly string[]).includes(d.unit)) problems.push("UNIT");
  if (!between(d.packSize, 1, 100_000)) problems.push("PACK_SIZE");
  if (!between(d.mrpPaise, 100, 10_000_000)) problems.push("MRP");
  if (!(GST_RATES_BPS as readonly number[]).includes(d.gstBps)) problems.push("GST");
  if (!between(d.minOrderQty, 1, 10_000)) problems.push("MIN_ORDER");
  if (!between(d.maxPerFlat, 1, 50)) problems.push("MAX_PER_FLAT");
  if (validateTiers(d.tiers).length > 0) problems.push("TIERS");
  else if (!problems.includes("MRP") && !problems.includes("GST") && highestResidentPrice(d.tiers, marginBps, d.gstBps) > d.mrpPaise) problems.push("ABOVE_MRP");
  return problems;
}

export type ServiceDraft = {
  name: string;
  category: string;
  description: string;
  minFlats: number;
  noAccessFeePaise: number;
  durationMinutes: number;
  gstBps: number;
  weeklyByDefault: boolean;
};

export function checkService(d: ServiceDraft, allowed: readonly ServiceCategory[]): CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  if (!nameOk(d.name)) problems.push("NAME");
  if (!(allowed as readonly string[]).includes(d.category)) problems.push("CATEGORY");
  const description = d.description.trim();
  if (description.length < 10 || description.length > 400) problems.push("DESCRIPTION");
  if (!between(d.minFlats, 1, 500)) problems.push("MIN_FLATS");
  if (!between(d.noAccessFeePaise, 0, 200_000)) problems.push("FEE");
  if (!between(d.durationMinutes, 15, 600)) problems.push("DURATION");
  if (!(GST_RATES_BPS as readonly number[]).includes(d.gstBps)) problems.push("GST");
  return problems;
}

export type OptionDraft = {
  name: string;
  unitLabel: string;
  mrpPaise: number;
  maxPerFlat: number;
  /** minQty counts flats booked. */
  tiers: Tier[];
};

/** `gstBps` is the service's. */
export function checkOption(d: OptionDraft, marginBps: number, gstBps: number): CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  if (!nameOk(d.name, 60)) problems.push("NAME");
  if (!/^[a-z][a-z ]{1,19}$/i.test(d.unitLabel.trim())) problems.push("UNIT_LABEL");
  if (!between(d.mrpPaise, 100, 10_000_000)) problems.push("MRP");
  if (!between(d.maxPerFlat, 1, 20)) problems.push("MAX_PER_FLAT");
  if (validateTiers(d.tiers).length > 0) problems.push("TIERS");
  else if (!problems.includes("MRP") && highestResidentPrice(d.tiers, marginBps, gstBps) > d.mrpPaise) problems.push("ABOVE_MRP");
  return problems;
}

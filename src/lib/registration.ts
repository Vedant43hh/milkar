// Signing up: who may register themselves, how a new community's flats are laid out, GSTIN checks
// and what a vendor still needs before Milkar verifies them. Pure.

export type RegistrationRole = "RESIDENT" | "MANAGER" | "VENDOR";

/**
 * The roles people can choose for themselves. Technicians are added by their vendor, and platform
 * admins only by another admin (or the seed): neither can ever be registered.
 */
export const SELF_REGISTRATION_ROLES: readonly RegistrationRole[] = ["RESIDENT", "MANAGER", "VENDOR"];

export function isSelfRegistrationRole(role: unknown): role is RegistrationRole {
  return typeof role === "string" && (SELF_REGISTRATION_ROLES as readonly string[]).includes(role);
}

// ---------- a new community's flats ----------

export const MAX_FLATS = 2000;
export const MAX_FLOORS = 60;
export const MAX_UNITS_PER_FLOOR = 20;
export const MAX_BLOCKS = 40;

export type FlatLayout = { blocks: string[]; floors: number; unitsPerFloor: number };
export type LayoutProblem = "NO_BLOCKS" | "BAD_FLOORS" | "BAD_UNITS" | "TOO_MANY_FLATS";

/**
 * Block (tower, wing) names from what the manager typed: a list ("A, B, C") and/or ranges
 * ("A-D", "1-12"). Returns null if anything can't be read.
 */
export function parseBlocks(input: string): string[] | null {
  const blocks: string[] = [];
  for (const part of input.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const letters = /^([A-Za-z])\s*-\s*([A-Za-z])$/.exec(part);
    const numbers = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(part);
    if (letters) {
      const [from, to] = [letters[1].toUpperCase().charCodeAt(0), letters[2].toUpperCase().charCodeAt(0)];
      if (to < from) return null;
      for (let c = from; c <= to; c++) blocks.push(String.fromCharCode(c));
    } else if (numbers) {
      const [from, to] = [Number(numbers[1]), Number(numbers[2])];
      if (to < from) return null;
      for (let n = from; n <= to; n++) blocks.push(String(n));
    } else if (/^[A-Za-z0-9][A-Za-z0-9 ]{0,9}$/.test(part)) {
      blocks.push(part.toUpperCase());
    } else {
      return null;
    }
  }
  const unique = [...new Set(blocks)];
  return unique.length === blocks.length && unique.length <= MAX_BLOCKS ? unique : null;
}

export function layoutProblems(layout: FlatLayout): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  if (layout.blocks.length === 0) problems.push("NO_BLOCKS");
  if (!Number.isInteger(layout.floors) || layout.floors < 1 || layout.floors > MAX_FLOORS) problems.push("BAD_FLOORS");
  if (!Number.isInteger(layout.unitsPerFloor) || layout.unitsPerFloor < 1 || layout.unitsPerFloor > MAX_UNITS_PER_FLOOR) problems.push("BAD_UNITS");
  if (problems.length === 0 && flatCount(layout) > MAX_FLATS) problems.push("TOO_MANY_FLATS");
  return problems;
}

export function flatCount(layout: FlatLayout): number {
  return layout.blocks.length * layout.floors * layout.unitsPerFloor;
}

/** Every flat: floor then unit, the way Indian buildings number them (101, 102 … 1204). */
export function generateFlats(layout: FlatLayout): { tower: string; number: string }[] {
  const flats: { tower: string; number: string }[] = [];
  for (const tower of layout.blocks) {
    for (let floor = 1; floor <= layout.floors; floor++) {
      for (let unit = 1; unit <= layout.unitsPerFloor; unit++) flats.push({ tower, number: String(floor * 100 + unit) });
    }
  }
  return flats;
}

/** An invite code from the community's name ("Lakeview Residency" → "LAKEVIEW"), made unique with a number. */
export function communityCodeFrom(name: string, isTaken: (code: string) => boolean): string {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
  let base = "";
  for (const word of words) {
    if (base.length >= 6) break;
    base += word;
  }
  base = (base || "MILKAR").slice(0, 8);
  if (base.length < 4) base = `${base}HOME`.slice(0, 8);
  if (!isTaken(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const code = `${base.slice(0, 8 - String(n).length)}${n}`;
    if (!isTaken(code)) return code;
  }
  throw new Error(`No free invite code for ${name}`);
}

// ---------- vendors ----------

/** Six-digit Indian pincodes, separated by commas or spaces. Null if any isn't one. */
export function parsePincodes(input: string): string[] | null {
  const parts = input.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 30 || !parts.every((p) => /^[1-9]\d{5}$/.test(p))) return null;
  return [...new Set(parts)];
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A GSTIN: state code, PAN, entity number, "Z", and a check character (mod-36 checksum). */
export function isValidGstin(gstin: string): boolean {
  const value = gstin.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(value[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === value[14];
}

export type ChecklistKey = "BUSINESS" | "SERVICE_AREA" | "GSTIN" | "CATALOGUE" | "REVIEW";
export type ChecklistItem = { key: ChecklistKey; done: boolean; optional: boolean };

/**
 * What a vendor still needs before (and for) verification: business details, where they work, a
 * GSTIN (optional: small suppliers needn't have one), something to sell, and Milkar's review.
 */
export function vendorChecklist(vendor: {
  name: string;
  phone: string;
  city: string;
  serviceAreaPincodes: readonly string[];
  gstin: string | null;
  catalogueItems: number;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
}): ChecklistItem[] {
  return [
    { key: "BUSINESS", done: vendor.name.trim().length > 1 && vendor.phone.length > 0 && vendor.city.trim().length > 1, optional: false },
    { key: "SERVICE_AREA", done: vendor.serviceAreaPincodes.length > 0, optional: false },
    { key: "GSTIN", done: !!vendor.gstin && isValidGstin(vendor.gstin), optional: true },
    { key: "CATALOGUE", done: vendor.catalogueItems > 0, optional: false },
    { key: "REVIEW", done: vendor.verificationStatus === "VERIFIED", optional: false },
  ];
}

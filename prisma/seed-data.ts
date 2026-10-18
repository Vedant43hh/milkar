// Seed catalog and residents. Prices are what residents pay per unit (incl. 3% margin and GST);
// the seed derives GST-exclusive supplier tier prices from them.
// GST rates are illustrative for a demo; verify current rates before real use.
import type { Category, Unit } from "../src/generated/prisma/enums";

export type SeedProduct = {
  key: string;
  supplier: 1 | 2;
  name: string;
  category: Category;
  unit: Unit;
  packSize: number;
  mrp: number; // rupees
  gstPct: number;
  minOrderQty: number;
  maxPerFlat: number;
  /** [minQty, resident price in rupees] */
  tiers: [number, number][];
};

export const SUPPLIERS = {
  1: { name: "Shree Balaji Wholesale Traders", gstin: "27ABCDE1234F1Z5", phone: "+912024000001", city: "Pune" },
  2: { name: "Annapurna Home Care Distributors", gstin: "27PQRSX5678L1Z2", phone: "+912024000002", city: "Pune" },
} as const;

export const PRODUCTS: SeedProduct[] = [
  { key: "rice", supplier: 1, name: "Sona Masoori Rice", category: "GRAINS_FLOUR", unit: "KG", packSize: 5, mrp: 550, gstPct: 5, minOrderQty: 10, maxPerFlat: 4, tiers: [[1, 500], [20, 465], [50, 440]] },
  { key: "basmati", supplier: 1, name: "Basmati Rice", category: "GRAINS_FLOUR", unit: "KG", packSize: 1, mrp: 160, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 140], [15, 128], [40, 120]] },
  { key: "atta", supplier: 1, name: "Chakki Fresh Atta", category: "GRAINS_FLOUR", unit: "KG", packSize: 10, mrp: 520, gstPct: 5, minOrderQty: 8, maxPerFlat: 3, tiers: [[1, 470], [15, 445], [40, 425]] },
  { key: "toor", supplier: 1, name: "Toor Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 190, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 168], [20, 158], [50, 150]] },
  { key: "moong", supplier: 1, name: "Moong Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 165, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 148], [20, 139], [50, 132]] },
  { key: "chana", supplier: 1, name: "Chana Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 110, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 96], [20, 90], [50, 86]] },
  { key: "masoor", supplier: 1, name: "Masoor Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 125, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 110], [20, 103], [50, 98]] },
  { key: "besan", supplier: 1, name: "Besan", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 120, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 104], [15, 98], [40, 93]] },
  { key: "sunflower", supplier: 1, name: "Sunflower Oil (pouch)", category: "OILS_GHEE", unit: "LITRE", packSize: 1, mrp: 175, gstPct: 5, minOrderQty: 12, maxPerFlat: 6, tiers: [[1, 155], [24, 146], [60, 139]] },
  { key: "mustard", supplier: 1, name: "Kachi Ghani Mustard Oil", category: "OILS_GHEE", unit: "LITRE", packSize: 1, mrp: 190, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 170], [20, 160], [50, 152]] },
  { key: "groundnut", supplier: 1, name: "Groundnut Oil", category: "OILS_GHEE", unit: "LITRE", packSize: 1, mrp: 210, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 188], [20, 178], [50, 170]] },
  { key: "sugar", supplier: 1, name: "Sugar", category: "SUGAR_SALT", unit: "KG", packSize: 5, mrp: 260, gstPct: 5, minOrderQty: 10, maxPerFlat: 3, tiers: [[1, 232], [20, 220], [50, 210]] },
  { key: "jaggery", supplier: 1, name: "Jaggery (Gud)", category: "SUGAR_SALT", unit: "KG", packSize: 1, mrp: 95, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 84], [15, 79], [40, 75]] },
  { key: "salt", supplier: 1, name: "Iodised Salt", category: "SUGAR_SALT", unit: "KG", packSize: 1, mrp: 28, gstPct: 0, minOrderQty: 20, maxPerFlat: 6, tiers: [[1, 25], [30, 23], [80, 22]] },
  { key: "tea", supplier: 1, name: "Assam CTC Tea", category: "TEA_COFFEE", unit: "G", packSize: 500, mrp: 290, gstPct: 5, minOrderQty: 8, maxPerFlat: 3, tiers: [[1, 255], [15, 240], [40, 228]] },
  { key: "coffee", supplier: 1, name: "Filter Coffee Powder", category: "TEA_COFFEE", unit: "G", packSize: 200, mrp: 180, gstPct: 5, minOrderQty: 6, maxPerFlat: 3, tiers: [[1, 160], [12, 150], [30, 142]] },
  { key: "poha", supplier: 1, name: "Thick Poha", category: "BREAKFAST", unit: "KG", packSize: 1, mrp: 85, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 74], [15, 70], [40, 66]] },
  { key: "rava", supplier: 1, name: "Bombay Rava (Sooji)", category: "BREAKFAST", unit: "KG", packSize: 1, mrp: 70, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 60], [15, 56], [40, 53]] },
  { key: "turmeric", supplier: 1, name: "Turmeric Powder", category: "SPICES", unit: "G", packSize: 200, mrp: 75, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 64], [15, 60], [40, 56]] },
  { key: "chilli", supplier: 1, name: "Kashmiri Chilli Powder", category: "SPICES", unit: "G", packSize: 200, mrp: 120, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 104], [15, 97], [40, 92]] },
  { key: "detergent", supplier: 2, name: "Detergent Powder", category: "HOME_CARE", unit: "KG", packSize: 4, mrp: 520, gstPct: 18, minOrderQty: 8, maxPerFlat: 2, tiers: [[1, 465], [15, 440], [40, 418]] },
  { key: "dishwash", supplier: 2, name: "Dishwash Bar, pack of 4", category: "HOME_CARE", unit: "PACKET", packSize: 1, mrp: 100, gstPct: 18, minOrderQty: 10, maxPerFlat: 4, tiers: [[1, 88], [20, 82], [50, 78]] },
  { key: "floor", supplier: 2, name: "Floor Cleaner", category: "HOME_CARE", unit: "LITRE", packSize: 2, mrp: 399, gstPct: 18, minOrderQty: 6, maxPerFlat: 2, tiers: [[1, 349], [12, 329], [30, 312]] },
  { key: "toilet", supplier: 2, name: "Toilet Cleaner", category: "HOME_CARE", unit: "LITRE", packSize: 1, mrp: 210, gstPct: 18, minOrderQty: 6, maxPerFlat: 3, tiers: [[1, 184], [12, 174], [30, 165]] },
  { key: "soap", supplier: 2, name: "Bathing Soap, pack of 4", category: "PERSONAL_CARE", unit: "PACKET", packSize: 1, mrp: 180, gstPct: 5, minOrderQty: 8, maxPerFlat: 3, tiers: [[1, 156], [15, 148], [40, 140]] },
  { key: "eggs", supplier: 2, name: "Farm Eggs", category: "EGGS_DAIRY", unit: "DOZEN", packSize: 1, mrp: 96, gstPct: 0, minOrderQty: 10, maxPerFlat: 4, tiers: [[1, 84], [20, 79], [50, 75]] },
];

/** Towers A–D, five floors, two flats per floor: 101, 102, 201 … 502. */
export const TOWERS = ["A", "B", "C", "D"];
export const FLAT_NUMBERS = ["101", "102", "201", "202", "301", "302", "401", "402", "501", "502"];

/** Residents beyond the demo accounts. C-301 has two family members. */
export const RESIDENTS: { name: string; flat: string }[] = [
  { name: "Ananya Iyer", flat: "A-102" },
  { name: "Vikram Joshi", flat: "A-201" },
  { name: "Fatima Sheikh", flat: "A-302" },
  { name: "Harpreet Kaur", flat: "A-401" },
  { name: "Arjun Menon", flat: "B-101" },
  { name: "Kavita Patil", flat: "B-202" },
  { name: "Sanjay Gupta", flat: "B-301" },
  { name: "Neha Bhatt", flat: "B-501" },
  { name: "Rohan Pawar", flat: "C-102" },
  { name: "Deepa Krishnan", flat: "C-201" },
  { name: "Amit Shah", flat: "C-301" },
  { name: "Pooja Shah", flat: "C-301" },
  { name: "Mohammed Ansari", flat: "C-402" },
  { name: "Lakshmi Reddy", flat: "C-502" },
  { name: "Swati Kulkarni", flat: "D-101" },
  { name: "Gaurav Mehta", flat: "D-202" },
  { name: "Ritu Singh", flat: "D-301" },
  { name: "Joseph D'Souza", flat: "D-302" },
  { name: "Shreya Banerjee", flat: "D-501" },
];

/** Society-wide totals per round. The open round leaves several products just short of a tier. */
export const ROUNDS = {
  first: {
    title: "Monthly staples drive",
    totals: { rice: 52, toor: 24, atta: 16, sunflower: 26, sugar: 21, tea: 9, detergent: 9, eggs: 22, dishwash: 12, soap: 10 },
  },
  second: {
    title: "Festive stock-up",
    totals: { rice: 47, toor: 20, moong: 12, sunflower: 30, mustard: 11, sugar: 18, salt: 22, tea: 16, poha: 9, detergent: 10, eggs: 28, floor: 4, dishwash: 21 },
  },
  open: {
    title: "This week's group drive",
    totals: {
      rice: 42, basmati: 12, atta: 14, toor: 17, moong: 9, chana: 21, masoor: 6, besan: 11, sunflower: 20,
      mustard: 8, groundnut: 13, sugar: 23, jaggery: 7, salt: 26, tea: 13, coffee: 5, poha: 16, rava: 10,
      turmeric: 15, chilli: 9, detergent: 6, dishwash: 18, floor: 7, toilet: 5, soap: 12, eggs: 31,
    },
  },
} as const;

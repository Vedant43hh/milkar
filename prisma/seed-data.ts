// Seed catalogue, communities and residents. Prices are what residents pay per unit (incl. the
// 3% platform margin and GST); the seed derives GST-exclusive vendor tier prices from them and
// refuses any price that the margin and GST arithmetic can't hit exactly.
// GST rates and GSTINs are illustrative for a demo; verify current rates before real use.
import type { ProductCategory, ServiceCategory, Unit } from "../src/generated/prisma/enums";
import type { DemoVendorKey } from "../src/lib/demo";

export type SeedProduct = {
  key: string;
  vendor: Extract<DemoVendorKey, "balaji" | "annapurna">;
  name: string;
  category: ProductCategory;
  unit: Unit;
  packSize: number;
  mrp: number; // rupees
  gstPct: number;
  minOrderQty: number;
  maxPerFlat: number;
  /** [minQty, resident price in rupees] */
  tiers: [number, number][];
};

export const VENDOR_DETAILS: Record<
  DemoVendorKey,
  { gstin: string; phone: string; city: string; about: string; verification: "VERIFIED" | "PENDING"; note?: string; serviceArea: string[] }
> = {
  balaji: {
    gstin: "27ABCDE1234F1Z0",
    serviceArea: ["411045", "411057", "411021"],
    phone: "+912024000001",
    city: "Pune",
    about: "Wholesale grains, dals, oils and staples from Market Yard, Pune.",
    verification: "VERIFIED",
    note: "GST certificate and APMC trader licence checked.",
  },
  annapurna: {
    gstin: "27PQRSX5678L1ZW",
    serviceArea: ["411045", "411057"],
    phone: "+912024000002",
    city: "Pune",
    about: "Home care, personal care and farm eggs.",
    verification: "VERIFIED",
    note: "GST certificate checked.",
  },
  coolcare: {
    gstin: "27COOLC4321K1Z3",
    serviceArea: ["411045", "411057", "411007"],
    phone: "+912024000013",
    city: "Pune",
    about: "AC, RO and appliance servicing with trained, uniformed technicians. 90-day service warranty.",
    verification: "VERIFIED",
    note: "GST certificate, shop licence and police verification of all technicians checked.",
  },
  sparkle: {
    gstin: "27SPRKL8765H1ZU",
    serviceArea: ["411045", "411021", "560095"],
    phone: "+912024000014",
    city: "Pune",
    about: "Deep cleaning, pest control and tank cleaning. Licensed pest-control operator; odourless, child-safe products.",
    verification: "VERIFIED",
    note: "GST certificate, insecticide licence and staff ID proofs checked.",
  },
  fixright: {
    gstin: "27FIXRT9876N1ZA",
    serviceArea: ["411045", "411057", "411021"],
    phone: "+912024000016",
    city: "Pune",
    about: "Plumbers, electricians and carpenters for whole buildings. Parts at cost, shown to you before anything is fitted.",
    verification: "VERIFIED",
    note: "GST certificate, trade licence and police verification of technicians checked.",
  },
  washwell: {
    gstin: "27WASHW2468M1ZH",
    serviceArea: ["411045"],
    phone: "+912024000015",
    city: "Pune",
    about: "Waterless car wash at your parking spot, every week.",
    verification: "PENDING",
  },
};

export const PRODUCTS: SeedProduct[] = [
  { key: "rice", vendor: "balaji", name: "Sona Masoori Rice", category: "GRAINS_FLOUR", unit: "KG", packSize: 5, mrp: 550, gstPct: 5, minOrderQty: 10, maxPerFlat: 4, tiers: [[1, 500], [20, 465], [50, 440]] },
  { key: "basmati", vendor: "balaji", name: "Basmati Rice", category: "GRAINS_FLOUR", unit: "KG", packSize: 1, mrp: 160, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 140], [15, 128], [40, 120]] },
  { key: "atta", vendor: "balaji", name: "Chakki Fresh Atta", category: "GRAINS_FLOUR", unit: "KG", packSize: 10, mrp: 520, gstPct: 5, minOrderQty: 8, maxPerFlat: 3, tiers: [[1, 470], [15, 445], [40, 425]] },
  { key: "toor", vendor: "balaji", name: "Toor Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 190, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 168], [20, 158], [50, 150]] },
  { key: "moong", vendor: "balaji", name: "Moong Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 165, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 148], [20, 139], [50, 132]] },
  { key: "chana", vendor: "balaji", name: "Chana Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 110, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 96], [20, 90], [50, 86]] },
  { key: "masoor", vendor: "balaji", name: "Masoor Dal", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 125, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 110], [20, 102], [50, 98]] },
  { key: "besan", vendor: "balaji", name: "Besan", category: "DALS_PULSES", unit: "KG", packSize: 1, mrp: 120, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 105], [15, 98], [40, 93]] },
  { key: "sunflower", vendor: "balaji", name: "Sunflower Oil (pouch)", category: "OILS_GHEE", unit: "LITRE", packSize: 1, mrp: 175, gstPct: 5, minOrderQty: 12, maxPerFlat: 6, tiers: [[1, 155], [24, 146], [60, 139]] },
  { key: "mustard", vendor: "balaji", name: "Kachi Ghani Mustard Oil", category: "OILS_GHEE", unit: "LITRE", packSize: 1, mrp: 190, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 170], [20, 160], [50, 152]] },
  { key: "groundnut", vendor: "balaji", name: "Groundnut Oil", category: "OILS_GHEE", unit: "LITRE", packSize: 1, mrp: 210, gstPct: 5, minOrderQty: 10, maxPerFlat: 5, tiers: [[1, 189], [20, 178], [50, 170]] },
  { key: "sugar", vendor: "balaji", name: "Sugar", category: "SUGAR_SALT", unit: "KG", packSize: 5, mrp: 260, gstPct: 5, minOrderQty: 10, maxPerFlat: 3, tiers: [[1, 232], [20, 220], [50, 210]] },
  { key: "jaggery", vendor: "balaji", name: "Jaggery (Gud)", category: "SUGAR_SALT", unit: "KG", packSize: 1, mrp: 95, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 84], [15, 79], [40, 75]] },
  { key: "salt", vendor: "balaji", name: "Iodised Salt", category: "SUGAR_SALT", unit: "KG", packSize: 1, mrp: 28, gstPct: 0, minOrderQty: 20, maxPerFlat: 6, tiers: [[1, 25], [30, 23], [80, 22]] },
  { key: "tea", vendor: "balaji", name: "Assam CTC Tea", category: "TEA_COFFEE", unit: "G", packSize: 500, mrp: 290, gstPct: 5, minOrderQty: 8, maxPerFlat: 3, tiers: [[1, 255], [15, 240], [40, 228]] },
  { key: "coffee", vendor: "balaji", name: "Filter Coffee Powder", category: "TEA_COFFEE", unit: "G", packSize: 200, mrp: 180, gstPct: 5, minOrderQty: 6, maxPerFlat: 3, tiers: [[1, 160], [12, 150], [30, 142]] },
  { key: "poha", vendor: "balaji", name: "Thick Poha", category: "BREAKFAST", unit: "KG", packSize: 1, mrp: 85, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 74], [15, 70], [40, 66]] },
  { key: "rava", vendor: "balaji", name: "Bombay Rava (Sooji)", category: "BREAKFAST", unit: "KG", packSize: 1, mrp: 70, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 60], [15, 56], [40, 53]] },
  { key: "turmeric", vendor: "balaji", name: "Turmeric Powder", category: "SPICES", unit: "G", packSize: 200, mrp: 75, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 64], [15, 60], [40, 56]] },
  { key: "chilli", vendor: "balaji", name: "Kashmiri Chilli Powder", category: "SPICES", unit: "G", packSize: 200, mrp: 120, gstPct: 5, minOrderQty: 8, maxPerFlat: 4, tiers: [[1, 105], [15, 97], [40, 92]] },
  { key: "detergent", vendor: "annapurna", name: "Detergent Powder", category: "HOME_CARE", unit: "KG", packSize: 4, mrp: 520, gstPct: 18, minOrderQty: 8, maxPerFlat: 2, tiers: [[1, 465], [15, 440], [40, 418]] },
  { key: "dishwash", vendor: "annapurna", name: "Dishwash Bar, pack of 4", category: "HOME_CARE", unit: "PACKET", packSize: 1, mrp: 100, gstPct: 18, minOrderQty: 10, maxPerFlat: 4, tiers: [[1, 88], [20, 82], [50, 78]] },
  { key: "floor", vendor: "annapurna", name: "Floor Cleaner", category: "HOME_CARE", unit: "LITRE", packSize: 2, mrp: 399, gstPct: 18, minOrderQty: 6, maxPerFlat: 2, tiers: [[1, 349], [12, 329], [30, 312]] },
  { key: "toilet", vendor: "annapurna", name: "Toilet Cleaner", category: "HOME_CARE", unit: "LITRE", packSize: 1, mrp: 210, gstPct: 18, minOrderQty: 6, maxPerFlat: 3, tiers: [[1, 184], [12, 173], [30, 165]] },
  { key: "soap", vendor: "annapurna", name: "Bathing Soap, pack of 4", category: "PERSONAL_CARE", unit: "PACKET", packSize: 1, mrp: 180, gstPct: 5, minOrderQty: 8, maxPerFlat: 3, tiers: [[1, 156], [15, 148], [40, 140]] },
  { key: "eggs", vendor: "annapurna", name: "Farm Eggs", category: "EGGS_DAIRY", unit: "DOZEN", packSize: 1, mrp: 96, gstPct: 0, minOrderQty: 10, maxPerFlat: 4, tiers: [[1, 84], [20, 79], [50, 75]] },
];

export type SeedServiceOption = {
  key: string;
  name: string;
  unitLabel: string;
  mrp: number;
  maxPerFlat: number;
  /** [minFlats, resident price per unit in rupees] */
  tiers: [number, number][];
};

export type SeedService = {
  key: string;
  vendor: Extract<DemoVendorKey, "coolcare" | "sparkle" | "washwell" | "fixright">;
  category: ServiceCategory;
  name: string;
  description: string;
  minFlats: number;
  noAccessFee: number; // rupees, GST-inclusive
  durationMinutes: number;
  gstPct: number;
  weeklyByDefault?: boolean;
  options: SeedServiceOption[];
  /** [start, end, technicians] in IST */
  slots: [string, string, number][];
};

export const SERVICES: SeedService[] = [
  {
    key: "ac",
    vendor: "coolcare",
    category: "AC",
    name: "AC servicing",
    description: "Jet-pump wash of indoor and outdoor units, filter clean, drain check and gas pressure check.",
    minFlats: 5,
    noAccessFee: 149,
    durationMinutes: 60,
    gstPct: 18,
    options: [
      { key: "split", name: "Split AC", unitLabel: "unit", mrp: 899, maxPerFlat: 4, tiers: [[1, 699], [5, 549], [20, 400]] },
      { key: "window", name: "Window AC", unitLabel: "unit", mrp: 799, maxPerFlat: 3, tiers: [[1, 599], [5, 449], [20, 349]] },
    ],
    slots: [["09:00", "11:00", 3], ["11:00", "13:00", 3], ["14:00", "16:00", 3], ["16:00", "18:00", 2]],
  },
  {
    key: "ro",
    vendor: "coolcare",
    category: "RO",
    name: "RO purifier service",
    description: "Sediment and carbon filter change, membrane check and TDS test.",
    minFlats: 6,
    noAccessFee: 99,
    durationMinutes: 45,
    gstPct: 18,
    options: [{ key: "ro", name: "RO service + filter change", unitLabel: "purifier", mrp: 1499, maxPerFlat: 2, tiers: [[1, 1199], [6, 999], [15, 799]] }],
    slots: [["10:00", "13:00", 2], ["14:00", "17:00", 2]],
  },
  {
    key: "appliance",
    vendor: "coolcare",
    category: "APPLIANCE_REPAIR",
    name: "Appliance check-up",
    description: "Inspection and minor fixes for washing machines and refrigerators. Spare parts are billed separately.",
    minFlats: 4,
    noAccessFee: 99,
    durationMinutes: 60,
    gstPct: 18,
    options: [
      { key: "washer", name: "Washing machine check-up", unitLabel: "machine", mrp: 649, maxPerFlat: 1, tiers: [[1, 499], [4, 449], [10, 349]] },
      { key: "fridge", name: "Refrigerator check-up", unitLabel: "fridge", mrp: 749, maxPerFlat: 2, tiers: [[1, 599], [4, 499], [10, 449]] },
    ],
    slots: [["10:00", "13:00", 2], ["14:00", "17:00", 2]],
  },
  {
    key: "deepclean",
    vendor: "sparkle",
    category: "DEEP_CLEANING",
    name: "Deep cleaning",
    description: "Full-home deep clean: kitchen degreasing, bathroom descaling, floors, windows, fans and balconies.",
    minFlats: 5,
    noAccessFee: 199,
    durationMinutes: 240,
    gstPct: 18,
    options: [
      { key: "1bhk", name: "1 BHK", unitLabel: "home", mrp: 3499, maxPerFlat: 1, tiers: [[1, 2799], [5, 2499], [12, 2199]] },
      { key: "2bhk", name: "2 BHK", unitLabel: "home", mrp: 4499, maxPerFlat: 1, tiers: [[1, 3799], [5, 3299], [12, 2899]] },
      { key: "3bhk", name: "3 BHK", unitLabel: "home", mrp: 5999, maxPerFlat: 1, tiers: [[1, 4999], [5, 4299], [12, 3799]] },
    ],
    slots: [["09:00", "13:00", 2], ["14:00", "18:00", 2]],
  },
  {
    key: "pest",
    vendor: "sparkle",
    category: "PEST_CONTROL",
    name: "Pest control",
    description: "Gel treatment for cockroaches and ants plus a spray for drains and balconies. Safe for kids and pets after 2 hours.",
    minFlats: 8,
    noAccessFee: 99,
    durationMinutes: 45,
    gstPct: 18,
    options: [
      { key: "1bhk", name: "1 BHK", unitLabel: "home", mrp: 1499, maxPerFlat: 1, tiers: [[1, 1199], [8, 999], [20, 699]] },
      { key: "2bhk", name: "2 BHK", unitLabel: "home", mrp: 1799, maxPerFlat: 1, tiers: [[1, 1499], [8, 1299], [20, 1099]] },
      { key: "3bhk", name: "3 BHK", unitLabel: "home", mrp: 2199, maxPerFlat: 1, tiers: [[1, 1799], [8, 1499], [20, 1299]] },
    ],
    slots: [["10:00", "12:00", 3], ["12:00", "14:00", 3], ["15:00", "17:00", 3]],
  },
  {
    key: "tank",
    vendor: "sparkle",
    category: "WATER_TANK",
    name: "Water tank cleaning",
    description: "Drain, scrub, sludge removal and anti-bacterial rinse of your flat's overhead or loft tank.",
    minFlats: 10,
    noAccessFee: 99,
    durationMinutes: 60,
    gstPct: 18,
    options: [{ key: "tank", name: "Tank up to 1,000 L", unitLabel: "tank", mrp: 999, maxPerFlat: 2, tiers: [[1, 799], [10, 599], [25, 499]] }],
    slots: [["09:00", "12:00", 2], ["13:00", "16:00", 2]],
  },
  {
    key: "sofa",
    vendor: "sparkle",
    category: "SOFA_CARPET",
    name: "Sofa & carpet shampoo",
    description: "Shampoo and wet-vacuum extraction for fabric sofas and carpets. Dry in 4–6 hours.",
    minFlats: 5,
    noAccessFee: 99,
    durationMinutes: 90,
    gstPct: 18,
    options: [
      { key: "seat", name: "Sofa, per seat", unitLabel: "seat", mrp: 399, maxPerFlat: 8, tiers: [[1, 299], [5, 249], [12, 199]] },
      { key: "carpet", name: "Carpet up to 50 sq ft", unitLabel: "carpet", mrp: 999, maxPerFlat: 3, tiers: [[1, 799], [5, 599], [12, 499]] },
    ],
    slots: [["10:00", "13:00", 2], ["14:00", "17:00", 2]],
  },
  {
    key: "chimney",
    vendor: "sparkle",
    category: "CHIMNEY",
    name: "Kitchen chimney cleaning",
    description: "Filter degreasing, hood cleaning and motor check.",
    minFlats: 5,
    noAccessFee: 99,
    durationMinutes: 60,
    gstPct: 18,
    options: [{ key: "chimney", name: "Kitchen chimney", unitLabel: "chimney", mrp: 999, maxPerFlat: 1, tiers: [[1, 799], [5, 599], [12, 499]] }],
    slots: [["10:00", "13:00", 2], ["14:00", "17:00", 2]],
  },
  {
    key: "plumber",
    vendor: "fixright",
    category: "PLUMBER",
    name: "Plumber",
    description: "Leaking taps, flush tanks, blocked drains and pipe fixes. Parts at cost, approved by you first.",
    minFlats: 4,
    noAccessFee: 99,
    durationMinutes: 60,
    gstPct: 18,
    options: [{ key: "visit", name: "Visit & labour", unitLabel: "visit", mrp: 499, maxPerFlat: 1, tiers: [[1, 389], [5, 299], [10, 249], [20, 199]] }],
    slots: [["09:00", "12:00", 3], ["13:00", "16:00", 3], ["16:00", "19:00", 2]],
  },
  {
    key: "electrician",
    vendor: "fixright",
    category: "ELECTRICIAN",
    name: "Electrician",
    description: "Switches, sockets, fans, lights and MCB trips. Parts at cost, approved by you first.",
    minFlats: 4,
    noAccessFee: 99,
    durationMinutes: 60,
    gstPct: 18,
    options: [{ key: "visit", name: "Visit & labour", unitLabel: "visit", mrp: 499, maxPerFlat: 1, tiers: [[1, 389], [5, 299], [10, 249], [20, 199]] }],
    slots: [["09:00", "12:00", 3], ["13:00", "16:00", 3], ["16:00", "19:00", 2]],
  },
  {
    key: "carpenter",
    vendor: "fixright",
    category: "CARPENTER",
    name: "Carpenter",
    description: "Hinges, drawer runners, door locks and furniture fixes. Parts at cost, approved by you first.",
    minFlats: 4,
    noAccessFee: 99,
    durationMinutes: 60,
    gstPct: 18,
    options: [{ key: "visit", name: "Visit & labour", unitLabel: "visit", mrp: 549, maxPerFlat: 1, tiers: [[1, 449], [5, 349], [10, 299], [20, 249]] }],
    slots: [["09:00", "12:00", 3], ["13:00", "16:00", 3], ["16:00", "19:00", 2]],
  },
  {
    key: "carwash",
    vendor: "washwell",
    category: "CAR_WASH",
    name: "Weekly car wash",
    description: "Waterless exterior wash, tyre shine and interior vacuum at your parking spot.",
    minFlats: 6,
    noAccessFee: 49,
    durationMinutes: 30,
    gstPct: 18,
    weeklyByDefault: true,
    options: [
      { key: "hatch", name: "Hatchback", unitLabel: "car", mrp: 499, maxPerFlat: 2, tiers: [[1, 349], [6, 299], [15, 249]] },
      { key: "sedan", name: "Sedan", unitLabel: "car", mrp: 599, maxPerFlat: 2, tiers: [[1, 449], [6, 349], [15, 299]] },
      { key: "suv", name: "SUV", unitLabel: "car", mrp: 699, maxPerFlat: 2, tiers: [[1, 499], [6, 449], [15, 389]] },
    ],
    slots: [["06:00", "08:00", 3], ["08:00", "10:00", 3], ["17:00", "19:00", 2]],
  },
];

/** Technicians shown on visits, per service vendor. */
export const TECHNICIANS: Record<SeedService["vendor"], string[]> = {
  // The first name of a vendor's list may be a demo technician account (DEMO_USERS); visits then link to it.
  coolcare: ["Santosh Gaikwad", "Irfan Shaikh", "Ganesh More"],
  sparkle: ["Lata Pawar", "Rekha Jadhav", "Anil Kamble", "Sunil Waghmare"],
  washwell: ["Raju Thapa", "Dinesh Rawat"],
  fixright: ["Mahesh Kale", "Salim Khan", "Prakash Jadhav"],
};

/** Green Meadows: Towers A–D, five floors, two flats per floor: 101, 102, 201 … 502. */
export const TOWERS = ["A", "B", "C", "D"];
export const FLAT_NUMBERS = ["101", "102", "201", "202", "301", "302", "401", "402", "501", "502"];

/** Green Meadows residents beyond the demo accounts. C-301 has two family members. */
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
  { name: "Nikhil Rane", flat: "A-202" },
  { name: "Sneha Joshi", flat: "A-402" },
  { name: "Prakash Iyer", flat: "A-501" },
  { name: "Ayesha Khan", flat: "B-102" },
  { name: "Rajesh Nair", flat: "B-201" },
  { name: "Tanvi Desai", flat: "B-302" },
  { name: "Karan Malhotra", flat: "C-101" },
  { name: "Divya Menon", flat: "C-202" },
  { name: "Suresh Bhosale", flat: "C-401" },
  { name: "Anjali Verma", flat: "D-102" },
  { name: "Vivek Kulkarni", flat: "D-401" },
  { name: "Farhan Qureshi", flat: "D-502" },
];

/** Sunrise Co-living: Wings A and B, rooms 101–106. */
export const PG_WINGS = ["A", "B"];
export const PG_ROOMS = ["101", "102", "103", "104", "105", "106"];
export const PG_MANAGER = { name: "Meera Iyer", flat: "A-101" };
export const PG_RESIDENTS: { name: string; flat: string }[] = [
  { name: "Rhea Kapoor", flat: "A-102" },
  { name: "Siddharth Rao", flat: "A-104" },
  { name: "Tenzin Dorje", flat: "A-105" },
  { name: "Aditi Sharma", flat: "B-101" },
  { name: "Yash Agarwal", flat: "B-103" },
  { name: "Neeraj Bisht", flat: "B-104" },
  { name: "Kavya Hegde", flat: "B-106" },
];

/** Community-wide totals per grocery round. The open round leaves several products just short of a tier. */
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
      rice: 49, basmati: 12, atta: 14, toor: 17, moong: 9, chana: 21, masoor: 6, besan: 11, sunflower: 20,
      mustard: 8, groundnut: 13, sugar: 23, jaggery: 7, salt: 26, tea: 13, coffee: 5, poha: 16, rava: 10,
      turmeric: 15, chilli: 9, detergent: 6, dishwash: 18, floor: 7, toilet: 5, soap: 12, eggs: 31,
    },
  },
  pg: {
    title: "Room essentials",
    totals: { tea: 9, coffee: 7, poha: 6, soap: 8, detergent: 4, dishwash: 5, eggs: 12 },
  },
} as const;

export const POLLS = {
  pest: {
    service: "pest",
    title: "Pest control before the monsoon",
    description: "Cockroach and ant treatment for the whole building at once works better, and 20+ flats unlocks ₹699 for a 1 BHK.",
    threshold: 20,
    votes: 23,
  },
  tank: {
    service: "tank",
    title: "Water tank cleaning",
    description: "Loft and overhead tanks haven't been cleaned since last year.",
    threshold: 20,
    votes: 12,
  },
  veg: {
    title: "Organic vegetable box",
    description: "A weekly box of seasonal organic vegetables from a farmers' co-op near Talegaon.",
    threshold: 15,
    votes: 8,
  },
  suggestion: {
    service: "sofa",
    title: "Sofa & carpet shampoo before Diwali",
    description: "Lots of us host family over Diwali. A group booking would be much cheaper.",
    by: "Kavita Patil",
  },
} as const;

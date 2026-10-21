// Seeded demo communities, vendors and accounts. Shared by the seed script and the DEMO_MODE
// login buttons.
import type { Role } from "./auth/rules";

export const DEMO_COMMUNITIES = {
  greenMeadows: {
    name: "Green Meadows CHS",
    code: "GREENMDW",
    type: "APARTMENT_SOCIETY",
    blockLabel: "Tower",
    unitLabel: "Flat",
    address: "Baner Road, Baner",
    city: "Pune",
    pincode: "411045",
  },
  sunrise: {
    name: "Sunrise Co-living",
    code: "SUNRISE",
    type: "PG_COLIVING",
    blockLabel: "Wing",
    unitLabel: "Room",
    address: "5th Block, Koramangala",
    city: "Bengaluru",
    pincode: "560095",
  },
} as const;

export type DemoCommunityKey = keyof typeof DEMO_COMMUNITIES;

export const DEMO_VENDORS = {
  balaji: { name: "Shree Balaji Wholesale Traders", kind: "GOODS" },
  annapurna: { name: "Annapurna Home Care Distributors", kind: "GOODS" },
  coolcare: { name: "CoolCare AC & Appliance", kind: "SERVICES" },
  sparkle: { name: "SparkleHome Cleaning & Pest Control", kind: "SERVICES" },
  washwell: { name: "WashWell Car Wash", kind: "SERVICES" },
} as const;

export type DemoVendorKey = keyof typeof DEMO_VENDORS;

export type DemoUserKey =
  | "resident"
  | "neighbour"
  | "pgResident"
  | "manager"
  | "assistantManager"
  | "vendorAc"
  | "vendorCleaning"
  | "vendorCarWash"
  | "vendorGrocery"
  | "vendorHomeCare"
  | "technicianCarWash"
  | "technicianCleaning"
  | "admin";

export type DemoUser = {
  phone: string;
  name: string;
  role: Role;
  /** Residents: "A-101" means tower/wing A, flat/room 101. */
  home?: { community: DemoCommunityKey; flat: string };
  /** Society Managers: the community they run. They don't live there as far as Milkar knows. */
  manages?: { community: DemoCommunityKey; kind: "PRIMARY" | "ASSISTANT" };
  /** Vendors and their technicians. */
  vendor?: DemoVendorKey;
};

/** In the order the login page lists them: residents, managers, vendors, technicians, admin. */
export const DEMO_USERS: Record<DemoUserKey, DemoUser> = {
  resident: { phone: "+919000000003", name: "Rahul Deshmukh", role: "RESIDENT", home: { community: "greenMeadows", flat: "A-101" } },
  neighbour: { phone: "+919000000005", name: "Kavya Deshpande", role: "RESIDENT", home: { community: "greenMeadows", flat: "B-402" } },
  pgResident: { phone: "+919000000004", name: "Arnav Sinha", role: "RESIDENT", home: { community: "sunrise", flat: "A-103" } },
  manager: { phone: "+919000000002", name: "Sunita Kulkarni", role: "MANAGER", manages: { community: "greenMeadows", kind: "PRIMARY" } },
  assistantManager: { phone: "+919000000006", name: "Deepak Rao", role: "MANAGER", manages: { community: "greenMeadows", kind: "ASSISTANT" } },
  vendorAc: { phone: "+919000000013", name: "Suresh Pillai", role: "VENDOR", vendor: "coolcare" },
  vendorCleaning: { phone: "+919000000014", name: "Nisha Thomas", role: "VENDOR", vendor: "sparkle" },
  vendorCarWash: { phone: "+919000000015", name: "Manoj Yadav", role: "VENDOR", vendor: "washwell" },
  vendorGrocery: { phone: "+919000000011", name: "Ramesh Agarwal", role: "VENDOR", vendor: "balaji" },
  vendorHomeCare: { phone: "+919000000012", name: "Imran Shaikh", role: "VENDOR", vendor: "annapurna" },
  technicianCarWash: { phone: "+919000000021", name: "Raju Thapa", role: "TECHNICIAN", vendor: "washwell" },
  technicianCleaning: { phone: "+919000000022", name: "Lata Pawar", role: "TECHNICIAN", vendor: "sparkle" },
  admin: { phone: "+919000000001", name: "Priya Nair", role: "ADMIN" },
};

export const DEMO_USER_KEYS = Object.keys(DEMO_USERS) as DemoUserKey[];

/** Short description for a demo login button: "Flat A-101 · Green Meadows CHS", the community run, or the vendor. */
export function demoUserContext(user: DemoUser): string | null {
  if (user.home) {
    const community = DEMO_COMMUNITIES[user.home.community];
    return `${community.unitLabel} ${user.home.flat} · ${community.name}`;
  }
  if (user.manages) return DEMO_COMMUNITIES[user.manages.community].name;
  return user.vendor ? DEMO_VENDORS[user.vendor].name : null;
}

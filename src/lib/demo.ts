// Seeded demo accounts. Shared by the seed script and the DEMO_MODE login buttons.

export const DEMO_SOCIETY = {
  name: "Green Meadows CHS",
  code: "GREENMDW",
  address: "Baner Road, Baner",
  city: "Pune",
  pincode: "411045",
} as const;

export type DemoUserKey = "admin" | "captain" | "resident" | "supplier1" | "supplier2";

export const DEMO_USERS: Record<
  DemoUserKey,
  { phone: string; name: string; role: "ADMIN" | "CAPTAIN" | "RESIDENT" | "SUPPLIER"; flat?: string; supplier?: 1 | 2 }
> = {
  admin: { phone: "+919000000001", name: "Priya Nair", role: "ADMIN" },
  captain: { phone: "+919000000002", name: "Sunita Kulkarni", role: "CAPTAIN", flat: "B-402" },
  resident: { phone: "+919000000003", name: "Rahul Deshmukh", role: "RESIDENT", flat: "A-101" },
  supplier1: { phone: "+919000000011", name: "Ramesh Agarwal", role: "SUPPLIER", supplier: 1 },
  supplier2: { phone: "+919000000012", name: "Imran Shaikh", role: "SUPPLIER", supplier: 2 },
};

export const DEMO_USER_KEYS = Object.keys(DEMO_USERS) as DemoUserKey[];

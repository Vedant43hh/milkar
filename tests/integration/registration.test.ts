// Phase 10: registering and approvals. Nobody gets in until someone with the right role approves,
// and nobody can ever register themselves as an admin or a technician.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { findUserByPhone } from "@/server/auth";
import { addTechnician, decideCommunity, decideJoinRequest, decideVendor, registerAccount, requestToJoin, type RegisterInput } from "@/server/registration";
import { truncateAll } from "../../prisma/truncate";
import { makeManager, makeNeighbourhood, nextPhone } from "./helpers";

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const now = new Date("2026-10-21T06:00:00Z");
let seq = 0;
const code = (prefix: string) => `${prefix}${++seq}`;

type Hood = Awaited<ReturnType<typeof makeNeighbourhood>>;
const asResident = (hood: Hood, flatIndex: number, phone = nextPhone(), name = "Ravi Kumar"): RegisterInput => ({
  phone,
  name,
  role: "RESIDENT",
  details: { kind: "RESIDENT", communityId: hood.community.id, flatId: hood.community.flats[flatIndex].id },
});
const pendingRequest = (userId: string) => prisma.joinRequest.findFirstOrThrow({ where: { userId, status: "PENDING" } });
const notifications = (type: string) => prisma.notification.findMany({ where: { type: type as never }, orderBy: { userId: "asc" } });
const makeAdmin = async () => {
  const admin = await prisma.user.create({ data: { phone: nextPhone(), name: "Priya", role: "ADMIN" } });
  return { user: admin, actor: { id: admin.id, role: "ADMIN" as const, communityId: null } };
};

const lakeview = (overrides: Partial<{ name: string; floors: number; pincode: string }> = {}): RegisterInput => ({
  phone: nextPhone(),
  name: "Anil Kapoor",
  role: "MANAGER",
  details: {
    kind: "MANAGER",
    community: {
      name: overrides.name ?? "Lakeview Residency",
      type: "GATED_COMMUNITY",
      address: "Wakad Road, Wakad",
      city: "Pune",
      pincode: overrides.pincode ?? "411057",
      blockLabel: "Wing",
      unitLabel: "Flat",
      layout: { blocks: ["A", "B"], floors: overrides.floors ?? 3, unitsPerFloor: 2 },
    },
  },
});

describe("registering as a resident", () => {
  it("creates the account without a flat and asks the community's Society Managers", async () => {
    const hood = await makeNeighbourhood(code("REGA"), 3);
    const assistant = await makeManager(hood.community.id, "Assistant", "ASSISTANT");
    const phone = nextPhone();
    const result = await registerAccount(asResident(hood, 1, phone, "  Ravi   Kumar "), now);
    if (!result.ok) throw new Error(result.error);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: result.userId } })).toMatchObject({ phone, name: "Ravi Kumar", role: "RESIDENT", flatId: null });
    expect(await pendingRequest(result.userId)).toMatchObject({ communityId: hood.community.id, flatId: hood.community.flats[1].id, pendingUserId: result.userId });
    const asked = await notifications("JOIN_REQUEST");
    expect(asked.map((n) => n.userId).sort()).toEqual([hood.manager.id, assistant.id].sort());
    expect(asked[0].params).toEqual({ name: "Ravi Kumar", flat: "Flat A-102" });
  });

  it("puts them in the flat once a Society Manager approves, and tells them", async () => {
    const hood = await makeNeighbourhood(code("REGB"), 3);
    const result = await registerAccount(asResident(hood, 2), now);
    if (!result.ok) throw new Error(result.error);
    const request = await pendingRequest(result.userId);

    expect(await decideJoinRequest(hood.actor, request.id, "APPROVED", "", now)).toEqual({ ok: true });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: result.userId } })).flatId).toBe(hood.community.flats[2].id);
    expect(await prisma.joinRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ status: "APPROVED", pendingUserId: null, decidedById: hood.manager.id });
    expect((await notifications("JOIN_DECIDED"))[0]).toMatchObject({ userId: result.userId, params: { decision: "APPROVED" }, href: "/app" });
    expect(await decideJoinRequest(hood.actor, request.id, "REJECTED", "", now)).toEqual({ ok: false, error: "ALREADY_DECIDED" });
  });

  it("lets a declined resident see why and ask again, one request at a time", async () => {
    const hood = await makeNeighbourhood(code("REGC"), 3);
    const result = await registerAccount(asResident(hood, 1), now);
    if (!result.ok) throw new Error(result.error);
    const first = await pendingRequest(result.userId);
    await decideJoinRequest(hood.actor, first.id, "REJECTED", "  Please use the flat on your agreement ", now);
    expect(await prisma.joinRequest.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "REJECTED", note: "Please use the flat on your agreement" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: result.userId } })).flatId).toBeNull();

    const again = { communityId: hood.community.id, flatId: hood.community.flats[2].id };
    expect(await requestToJoin(result.userId, again, now)).toEqual({ ok: true });
    expect(await requestToJoin(result.userId, again, now)).toEqual({ ok: false, error: "ALREADY_PENDING" });
    expect(await prisma.joinRequest.count({ where: { userId: result.userId, status: "PENDING" } })).toBe(1);
  });

  it("can only be decided by that community's Society Managers", async () => {
    const hood = await makeNeighbourhood(code("REGD"), 2);
    const elsewhere = await makeNeighbourhood(code("REGE"), 2);
    const result = await registerAccount(asResident(hood, 1), now);
    if (!result.ok) throw new Error(result.error);
    const request = await pendingRequest(result.userId);
    expect(await decideJoinRequest(elsewhere.actor, request.id, "APPROVED", "", now)).toEqual({ ok: false, error: "FORBIDDEN" });
    const resident = hood.residents[0];
    expect(await decideJoinRequest({ id: resident.id, role: "RESIDENT", communityId: hood.community.id }, request.id, "APPROVED", "", now)).toEqual({ ok: false, error: "FORBIDDEN" });
    const assistant = await makeManager(hood.community.id, "Assistant", "ASSISTANT");
    expect(await decideJoinRequest({ id: assistant.id, role: "MANAGER", communityId: hood.community.id }, request.id, "APPROVED", "", now)).toEqual({ ok: true });
  });

  it("refuses flats from another community, unknown or not-yet-live communities, existing members and non-residents", async () => {
    const mine = await makeNeighbourhood(code("REGF"), 2);
    const other = await makeNeighbourhood(code("REGG"), 2);
    const wrongFlat = asResident(mine, 0);
    expect(await registerAccount({ ...wrongFlat, details: { kind: "RESIDENT", communityId: mine.community.id, flatId: other.community.flats[0].id } }, now)).toEqual({ ok: false, error: "UNKNOWN_FLAT" });
    expect(await registerAccount({ ...asResident(mine, 0), details: { kind: "RESIDENT", communityId: "nope", flatId: mine.community.flats[0].id } }, now)).toEqual({ ok: false, error: "UNKNOWN_COMMUNITY" });
    await prisma.community.update({ where: { id: other.community.id }, data: { status: "PENDING" } });
    expect(await registerAccount(asResident(other, 1), now)).toEqual({ ok: false, error: "UNKNOWN_COMMUNITY" });
    expect(await prisma.user.count({ where: { flatId: null, role: "RESIDENT" } })).toBe(0); // nothing half-created

    const member = mine.residents[0];
    expect(await requestToJoin(member.id, { communityId: mine.community.id, flatId: mine.community.flats[1].id }, now)).toEqual({ ok: false, error: "ALREADY_MEMBER" });
    const vendor = await prisma.user.create({ data: { phone: nextPhone(), role: "VENDOR" } });
    expect(await requestToJoin(vendor.id, { communityId: mine.community.id, flatId: mine.community.flats[0].id }, now)).toEqual({ ok: false, error: "NOT_RESIDENT" });
  });

  it("decides a request once when managers tap at the same time, and keeps one open request", async () => {
    const hood = await makeNeighbourhood(code("REGH"), 3);
    const assistant = await makeManager(hood.community.id, "Assistant", "ASSISTANT");
    const result = await registerAccount(asResident(hood, 1), now);
    if (!result.ok) throw new Error(result.error);
    const request = await pendingRequest(result.userId);
    const decisions = await Promise.all([
      decideJoinRequest(hood.actor, request.id, "APPROVED", "", now),
      decideJoinRequest({ id: assistant.id, role: "MANAGER", communityId: hood.community.id }, request.id, "REJECTED", "", now),
    ]);
    expect(decisions.filter((d) => d.ok)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { type: "JOIN_DECIDED" } })).toBe(1);

    const loner = await prisma.user.create({ data: { phone: nextPhone(), name: "Meera", role: "RESIDENT" } });
    const tries = await Promise.all(hood.community.flats.map((flat) => requestToJoin(loner.id, { communityId: hood.community.id, flatId: flat.id }, now)));
    expect(tries.filter((r) => r.ok)).toHaveLength(1);
  });

  it("refuses a number that already has an account, and a name that's too short", async () => {
    const hood = await makeNeighbourhood(code("REGI"), 2);
    const taken = hood.residents[0].phone;
    expect(await registerAccount(asResident(hood, 1, taken), now)).toEqual({ ok: false, error: "ALREADY_REGISTERED" });
    expect(await registerAccount(asResident(hood, 1, nextPhone(), " A "), now)).toEqual({ ok: false, error: "INVALID_NAME" });
  });
});

describe("registering a community", () => {
  it("creates it waiting for approval, with its flats and its Society Manager, and tells the admins", async () => {
    const admin = await makeAdmin();
    const input = lakeview();
    const result = await registerAccount(input, now);
    if (!result.ok) throw new Error(result.error);

    const community = await prisma.community.findFirstOrThrow({ where: { name: "Lakeview Residency" }, include: { flats: true, staff: true } });
    expect(community).toMatchObject({ status: "PENDING", code: "LAKEVIEW", type: "GATED_COMMUNITY", blockLabel: "Wing", registeredById: result.userId });
    expect(community.flats).toHaveLength(12);
    expect(community.flats.map((f) => `${f.tower}-${f.number}`)).toContain("B-302");
    expect(community.staff).toEqual([expect.objectContaining({ userId: result.userId, kind: "PRIMARY" })]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: result.userId } })).toMatchObject({ role: "MANAGER", flatId: null });
    expect((await notifications("COMMUNITY_REGISTERED")).map((n) => n.userId)).toEqual([admin.user.id]);

    // Not live yet: nobody can ask to join it.
    expect(await registerAccount({ phone: nextPhone(), name: "Early Bird", role: "RESIDENT", details: { kind: "RESIDENT", communityId: community.id, flatId: community.flats[0].id } }, now)).toEqual({
      ok: false,
      error: "UNKNOWN_COMMUNITY",
    });
  });

  it("goes live when a platform admin approves it, and only an admin decides", async () => {
    const admin = await makeAdmin();
    const result = await registerAccount(lakeview(), now);
    if (!result.ok) throw new Error(result.error);
    const community = await prisma.community.findFirstOrThrow({ where: { registeredById: result.userId } });

    expect(await decideCommunity({ id: result.userId, role: "MANAGER", communityId: community.id }, community.id, "APPROVED", "", now)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await decideCommunity(admin.actor, community.id, "APPROVED", "Checked the society registration", now)).toEqual({ ok: true });
    expect(await prisma.community.findUniqueOrThrow({ where: { id: community.id } })).toMatchObject({ status: "APPROVED", reviewNote: "Checked the society registration", reviewedAt: now });
    expect((await notifications("COMMUNITY_DECIDED"))[0]).toMatchObject({ userId: result.userId, params: { decision: "APPROVED" } });
    expect(await decideCommunity(admin.actor, community.id, "REJECTED", "", now)).toEqual({ ok: false, error: "ALREADY_DECIDED" });
  });

  it("gives a second community with the same name its own invite code", async () => {
    await registerAccount(lakeview(), now);
    await registerAccount(lakeview(), now);
    expect((await prisma.community.findMany({ orderBy: { createdAt: "asc" }, select: { code: true } })).map((c) => c.code).sort()).toEqual(["LAKEVIE2", "LAKEVIEW"]);
  });

  it("refuses an impossible layout or address", async () => {
    expect(await registerAccount(lakeview({ floors: 0 }), now)).toEqual({ ok: false, error: "INVALID_LAYOUT" });
    expect(await registerAccount(lakeview({ pincode: "123" }), now)).toEqual({ ok: false, error: "INVALID_COMMUNITY" });
    expect(await prisma.community.count()).toBe(0);
  });
});

describe("registering a vendor", () => {
  const fixRight = (gstin: string | null = "27aapfu0939f1zv"): RegisterInput => ({
    phone: nextPhone(),
    name: "Farooq Sheikh",
    role: "VENDOR",
    details: { kind: "VENDOR", business: { name: "FixRight Home Repairs", categories: ["REPAIRS", "HOME_SERVICES"], city: "Pune", serviceAreaPincodes: ["411045", "411057"], gstin } },
  });

  it("creates the business waiting for verification and tells the admins", async () => {
    const admin = await makeAdmin();
    const result = await registerAccount(fixRight(), now);
    if (!result.ok) throw new Error(result.error);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId }, include: { vendor: true } });
    expect(user).toMatchObject({ role: "VENDOR", flatId: null });
    expect(user.vendor).toMatchObject({ name: "FixRight Home Repairs", kind: "SERVICES", verificationStatus: "PENDING", gstin: "27AAPFU0939F1ZV", categories: ["REPAIRS", "HOME_SERVICES"], serviceAreaPincodes: ["411045", "411057"] });
    expect((await notifications("VENDOR_REGISTERED")).map((n) => n.userId)).toEqual([admin.user.id]);
  });

  it("is verified only by a platform admin", async () => {
    const admin = await makeAdmin();
    const result = await registerAccount(fixRight(), now);
    if (!result.ok) throw new Error(result.error);
    const { vendorId } = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(await decideVendor({ id: result.userId, role: "VENDOR", communityId: null }, vendorId!, "APPROVED", "", now)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await decideVendor(admin.actor, vendorId!, "APPROVED", "GST certificate and trade licence checked", now)).toEqual({ ok: true });
    expect(await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId! } })).toMatchObject({ verificationStatus: "VERIFIED", verifiedAt: now, verificationNote: "GST certificate and trade licence checked" });
    expect((await notifications("VENDOR_DECIDED"))[0]).toMatchObject({ userId: result.userId, params: { decision: "APPROVED" } });
  });

  it("refuses a GSTIN with a wrong check character, but GSTIN is optional", async () => {
    expect(await registerAccount(fixRight("27AAPFU0939F1ZW"), now)).toEqual({ ok: false, error: "INVALID_GSTIN" });
    expect((await registerAccount(fixRight(null), now)).ok).toBe(true);
  });
});

describe("accounts nobody can register", () => {
  it.each(["ADMIN", "TECHNICIAN", "admin", "SUPERUSER", ""])("%s is refused whatever the details say", async (role) => {
    const hood = await makeNeighbourhood(code("REGX"), 1);
    const crafted = { phone: nextPhone(), name: "Mallory", role, details: { kind: role, communityId: hood.community.id, flatId: hood.community.flats[0].id } } as unknown as RegisterInput;
    expect(await registerAccount(crafted, now)).toEqual({ ok: false, error: "ROLE_NOT_ALLOWED" });
    expect(await prisma.user.count({ where: { name: "Mallory" } })).toBe(0);
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(0);
  });

  it("refuses a role whose details don't match it", async () => {
    const crafted = { ...lakeview(), role: "RESIDENT" };
    expect(await registerAccount(crafted, now)).toEqual({ ok: false, error: "ROLE_NOT_ALLOWED" });
  });
});

describe("technicians", () => {
  it("are added by their vendor, and only by a vendor, then log in like anyone", async () => {
    const vendor = await prisma.vendor.create({ data: { name: "WashWell", kind: "SERVICES", phone: "+912024000015", city: "Pune" } });
    const owner = await prisma.user.create({ data: { phone: nextPhone(), role: "VENDOR", vendorId: vendor.id } });
    const phone = nextPhone();
    const added = await addTechnician({ role: owner.role, vendorId: owner.vendorId }, { phone, name: " Raju  Thapa " }, now);
    if (!added.ok) throw new Error(added.error);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: added.userId } })).toMatchObject({ role: "TECHNICIAN", vendorId: vendor.id, name: "Raju Thapa" });
    expect(await findUserByPhone(phone)).toMatchObject({ id: added.userId, role: "TECHNICIAN" });

    expect(await addTechnician({ role: owner.role, vendorId: owner.vendorId }, { phone, name: "Raju" }, now)).toEqual({ ok: false, error: "ALREADY_REGISTERED" });
    expect(await addTechnician({ role: "RESIDENT", vendorId: null }, { phone: nextPhone(), name: "Imposter" }, now)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await addTechnician({ role: "TECHNICIAN", vendorId: vendor.id }, { phone: nextPhone(), name: "Sneaky" }, now)).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

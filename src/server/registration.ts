import "server-only";
import type { CommunityType, Prisma, VendorCategory } from "@/generated/prisma/client";
import { canManageCommunity } from "@/lib/auth/rules";
import { prisma } from "@/lib/db";
import { notificationKeys } from "@/lib/notifications";
import { communityCodeFrom, generateFlats, isSelfRegistrationRole, isValidGstin, layoutProblems, type FlatLayout } from "@/lib/registration";
import { isUniqueViolation } from "./db-errors";
import { notify } from "./notifications";
import { communityManagerIds, type Actor } from "./rounds";

type Tx = Prisma.TransactionClient;

export type Decision = "APPROVED" | "REJECTED";

// ---------- registering ----------

export type ResidentDetails = { kind: "RESIDENT"; communityId: string; flatId: string };
export type ManagerDetails = {
  kind: "MANAGER";
  community: { name: string; type: CommunityType; address: string; city: string; pincode: string; blockLabel: string; unitLabel: string; layout: FlatLayout };
};
export type VendorDetails = {
  kind: "VENDOR";
  business: { name: string; categories: VendorCategory[]; city: string; serviceAreaPincodes: string[]; gstin: string | null };
};

export type RegisterInput = {
  /** E.164, already verified by OTP. */
  phone: string;
  name: string;
  /** What the person chose. Anything but RESIDENT, MANAGER or VENDOR is refused. */
  role: string;
  details: ResidentDetails | ManagerDetails | VendorDetails;
};

export type RegisterError =
  | "ROLE_NOT_ALLOWED"
  | "ALREADY_REGISTERED"
  | "INVALID_NAME"
  | "UNKNOWN_COMMUNITY"
  | "UNKNOWN_FLAT"
  | "INVALID_COMMUNITY"
  | "INVALID_LAYOUT"
  | "INVALID_BUSINESS"
  | "INVALID_GSTIN";

export type RegisterResult = { ok: true; userId: string } | { ok: false; error: RegisterError };

class RegisterFailure extends Error {
  constructor(readonly code: RegisterError) {
    super(code);
  }
}

function detailsProblem(details: RegisterInput["details"]): RegisterError | null {
  if (details.kind === "MANAGER") {
    const c = details.community;
    if (c.name.trim().length < 3 || c.address.trim().length < 5 || c.city.trim().length < 2 || !/^[1-9]\d{5}$/.test(c.pincode)) return "INVALID_COMMUNITY";
    if (!c.blockLabel.trim() || !c.unitLabel.trim()) return "INVALID_COMMUNITY";
    if (layoutProblems(c.layout).length > 0) return "INVALID_LAYOUT";
  }
  if (details.kind === "VENDOR") {
    const b = details.business;
    if (b.name.trim().length < 2 || b.city.trim().length < 2 || b.categories.length === 0 || b.serviceAreaPincodes.length === 0) return "INVALID_BUSINESS";
    if (b.gstin && !isValidGstin(b.gstin)) return "INVALID_GSTIN";
  }
  return null;
}

/**
 * Creates an account for a verified phone number together with what it is waiting for, in one
 * transaction: a resident's request to join a flat, a Society Manager's new community, or a
 * vendor's business. Nothing goes live until it is approved. Admin and technician accounts can
 * never be registered this way, whatever the request says.
 */
export async function registerAccount(input: RegisterInput, now: Date): Promise<RegisterResult> {
  if (!isSelfRegistrationRole(input.role) || input.details.kind !== input.role) return { ok: false, error: "ROLE_NOT_ALLOWED" };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return { ok: false, error: "INVALID_NAME" };
  const problem = detailsProblem(input.details);
  if (problem) return { ok: false, error: problem };

  // Two managers registering communities with the same name can race for an invite code; retry.
  for (let attempt = 0; ; attempt++) {
    try {
      const userId = await prisma.$transaction(async (tx) => {
        if (await tx.user.findUnique({ where: { phone: input.phone }, select: { id: true } })) throw new RegisterFailure("ALREADY_REGISTERED");
        switch (input.details.kind) {
          case "RESIDENT":
            return registerResident(tx, input.phone, name, input.details, now);
          case "MANAGER":
            return registerManager(tx, input.phone, name, input.details, now);
          case "VENDOR":
            return registerVendor(tx, input.phone, name, input.details, now);
        }
      });
      return { ok: true, userId };
    } catch (error) {
      if (error instanceof RegisterFailure) return { ok: false, error: error.code };
      if (isUniqueViolation(error, "phone")) return { ok: false, error: "ALREADY_REGISTERED" };
      if (isUniqueViolation(error, "code") && attempt < 3) continue;
      throw error;
    }
  }
}

async function registerResident(tx: Tx, phone: string, name: string, details: ResidentDetails, now: Date): Promise<string> {
  const user = await tx.user.create({ data: { phone, name, role: "RESIDENT", createdAt: now } });
  await createJoinRequest(tx, { id: user.id, name }, details, now);
  return user.id;
}

async function registerManager(tx: Tx, phone: string, name: string, details: ManagerDetails, now: Date): Promise<string> {
  const c = details.community;
  const taken = new Set((await tx.community.findMany({ select: { code: true } })).map((x) => x.code));
  const user = await tx.user.create({ data: { phone, name, role: "MANAGER", createdAt: now } });
  const community = await tx.community.create({
    data: {
      name: c.name.trim(),
      code: communityCodeFrom(c.name, (code) => taken.has(code)),
      type: c.type,
      address: c.address.trim(),
      city: c.city.trim(),
      pincode: c.pincode,
      blockLabel: c.blockLabel.trim(),
      unitLabel: c.unitLabel.trim(),
      status: "PENDING",
      registeredById: user.id,
      createdAt: now,
    },
  });
  await tx.flat.createMany({ data: generateFlats(c.layout).map((f) => ({ communityId: community.id, ...f })) });
  await tx.communityStaff.create({ data: { userId: user.id, communityId: community.id, kind: "PRIMARY", createdAt: now } });
  await notify(
    tx,
    await adminIds(tx),
    { type: "COMMUNITY_REGISTERED", params: { community: community.name, city: community.city }, href: "/admin/communities" },
    { dedupeKey: notificationKeys.communityRegistered(community.id), now },
  );
  return user.id;
}

async function registerVendor(tx: Tx, phone: string, name: string, details: VendorDetails, now: Date): Promise<string> {
  const b = details.business;
  const goodsOnly = b.categories.every((c) => c === "GROCERIES");
  const vendor = await tx.vendor.create({
    data: {
      name: b.name.trim(),
      kind: goodsOnly ? "GOODS" : "SERVICES",
      phone,
      city: b.city.trim(),
      gstin: b.gstin ? b.gstin.trim().toUpperCase() : null,
      categories: [...new Set(b.categories)],
      serviceAreaPincodes: b.serviceAreaPincodes,
      verificationStatus: "PENDING",
      createdAt: now,
    },
  });
  const user = await tx.user.create({ data: { phone, name, role: "VENDOR", vendorId: vendor.id, createdAt: now } });
  await notify(
    tx,
    await adminIds(tx),
    { type: "VENDOR_REGISTERED", params: { vendor: vendor.name, city: vendor.city }, href: "/admin/vendors" },
    { dedupeKey: notificationKeys.vendorRegistered(vendor.id), now },
  );
  return user.id;
}

async function adminIds(tx: Tx): Promise<string[]> {
  return (await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id);
}

// ---------- joining a community ----------

export type JoinError = "NOT_RESIDENT" | "ALREADY_MEMBER" | "ALREADY_PENDING" | "UNKNOWN_COMMUNITY" | "UNKNOWN_FLAT";

/** A request to join `flatId`, for the community's Society Managers to approve. One open request per resident. */
async function createJoinRequest(tx: Tx, user: { id: string; name: string }, input: { communityId: string; flatId: string }, now: Date): Promise<string> {
  const community = await tx.community.findFirst({ where: { id: input.communityId, status: "APPROVED" }, select: { id: true, unitLabel: true } });
  if (!community) throw new RegisterFailure("UNKNOWN_COMMUNITY");
  const flat = await tx.flat.findFirst({ where: { id: input.flatId, communityId: community.id }, select: { id: true, tower: true, number: true } });
  if (!flat) throw new RegisterFailure("UNKNOWN_FLAT");
  const request = await tx.joinRequest.create({
    data: { userId: user.id, communityId: community.id, flatId: flat.id, status: "PENDING", pendingUserId: user.id, createdAt: now },
  });
  await notify(
    tx,
    await communityManagerIds(tx, community.id),
    { type: "JOIN_REQUEST", params: { name: user.name, flat: `${community.unitLabel} ${flat.tower}-${flat.number}` }, href: "/manager/residents" },
    { dedupeKey: notificationKeys.joinRequest(request.id), now },
  );
  return request.id;
}

/** For a resident account without a flat (say, after a declined request): ask to join again. */
export async function requestToJoin(userId: string, input: { communityId: string; flatId: string }, now: Date): Promise<{ ok: true } | { ok: false; error: JoinError }> {
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, role: true, flatId: true } });
      if (user.role !== "RESIDENT") throw new JoinFailure("NOT_RESIDENT");
      if (user.flatId) throw new JoinFailure("ALREADY_MEMBER");
      await createJoinRequest(tx, { id: user.id, name: user.name ?? "" }, input, now);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof JoinFailure) return { ok: false, error: error.code };
    if (error instanceof RegisterFailure) return { ok: false, error: error.code as JoinError };
    if (isUniqueViolation(error, "pendingUserId")) return { ok: false, error: "ALREADY_PENDING" };
    throw error;
  }
}

class JoinFailure extends Error {
  constructor(readonly code: JoinError) {
    super(code);
  }
}

export async function cancelJoinRequest(userId: string): Promise<boolean> {
  const { count } = await prisma.joinRequest.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELLED", pendingUserId: null } });
  return count > 0;
}

export type DecisionError = "NOT_FOUND" | "FORBIDDEN" | "ALREADY_DECIDED" | "ALREADY_MEMBER";
export type DecisionResult = { ok: true } | { ok: false; error: DecisionError };

/**
 * A Society Manager (or assistant) of the community approves or declines a join request. Approval
 * puts the resident in the flat. A conditional update makes the decision exactly once, however
 * many managers tap at the same time.
 */
export async function decideJoinRequest(actor: Actor, requestId: string, decision: Decision, note: string, now: Date): Promise<DecisionResult> {
  return prisma.$transaction(async (tx): Promise<DecisionResult> => {
    const request = await tx.joinRequest.findUnique({ where: { id: requestId }, include: { community: { select: { name: true } } } });
    if (!request) return { ok: false, error: "NOT_FOUND" };
    if (!canManageCommunity(actor, request.communityId)) return { ok: false, error: "FORBIDDEN" };
    const decided = await tx.joinRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: decision, pendingUserId: null, decidedById: actor.id, decidedAt: now, note: note.trim().slice(0, 200) || null },
    });
    if (decided.count === 0) return { ok: false, error: "ALREADY_DECIDED" };
    if (decision === "APPROVED") {
      const placed = await tx.user.updateMany({ where: { id: request.userId, role: "RESIDENT", flatId: null }, data: { flatId: request.flatId } });
      if (placed.count === 0) throw new DecisionRollback("ALREADY_MEMBER");
    }
    await notify(
      tx,
      [request.userId],
      { type: "JOIN_DECIDED", params: { community: request.community.name, decision }, href: decision === "APPROVED" ? "/app" : "/app/join" },
      { dedupeKey: notificationKeys.joinDecided(request.id), now },
    );
    return { ok: true };
  }).catch((error: unknown): DecisionResult => {
    if (error instanceof DecisionRollback) return { ok: false, error: error.code };
    throw error;
  });
}

class DecisionRollback extends Error {
  constructor(readonly code: DecisionError) {
    super(code);
  }
}

// ---------- platform admin decisions ----------

/** A platform admin approves a registered community (it goes live, with its invite code) or declines it. */
export async function decideCommunity(actor: Actor, communityId: string, decision: Decision, note: string, now: Date): Promise<DecisionResult> {
  if (actor.role !== "ADMIN") return { ok: false, error: "FORBIDDEN" };
  return prisma.$transaction(async (tx): Promise<DecisionResult> => {
    const community = await tx.community.findUnique({ where: { id: communityId }, select: { id: true, name: true } });
    if (!community) return { ok: false, error: "NOT_FOUND" };
    const { count } = await tx.community.updateMany({
      where: { id: communityId, status: "PENDING" },
      data: { status: decision, reviewedAt: now, reviewNote: note.trim().slice(0, 300) || null },
    });
    if (count === 0) return { ok: false, error: "ALREADY_DECIDED" };
    await notify(
      tx,
      await communityManagerIds(tx, communityId),
      { type: "COMMUNITY_DECIDED", params: { community: community.name, decision }, href: "/manager" },
      { dedupeKey: notificationKeys.communityDecided(communityId, decision), now },
    );
    return { ok: true };
  });
}

/** A platform admin verifies a vendor (they can now join group buys) or declines, with a note on what was checked. */
export async function decideVendor(actor: Actor, vendorId: string, decision: Decision, note: string, now: Date): Promise<DecisionResult> {
  if (actor.role !== "ADMIN") return { ok: false, error: "FORBIDDEN" };
  return prisma.$transaction(async (tx): Promise<DecisionResult> => {
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true } });
    if (!vendor) return { ok: false, error: "NOT_FOUND" };
    const { count } = await tx.vendor.updateMany({
      where: { id: vendorId, verificationStatus: "PENDING" },
      data: { verificationStatus: decision === "APPROVED" ? "VERIFIED" : "REJECTED", verifiedAt: decision === "APPROVED" ? now : null, verificationNote: note.trim().slice(0, 300) || null },
    });
    if (count === 0) return { ok: false, error: "ALREADY_DECIDED" };
    const staff = await tx.user.findMany({ where: { vendorId, role: "VENDOR" }, select: { id: true } });
    await notify(
      tx,
      staff.map((u) => u.id),
      { type: "VENDOR_DECIDED", params: { vendor: vendor.name, decision }, href: "/vendor" },
      { dedupeKey: notificationKeys.vendorDecided(vendorId, decision), now },
    );
    return { ok: true };
  });
}

// ---------- technicians ----------

export type TechnicianError = "FORBIDDEN" | "INVALID_NAME" | "ALREADY_REGISTERED";

/** A vendor adds a member of staff as a technician: the only way a technician account comes to exist. */
export async function addTechnician(vendorUser: { role: string; vendorId: string | null }, input: { phone: string; name: string }, now: Date): Promise<{ ok: true; userId: string } | { ok: false; error: TechnicianError }> {
  if (vendorUser.role !== "VENDOR" || !vendorUser.vendorId) return { ok: false, error: "FORBIDDEN" };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) return { ok: false, error: "INVALID_NAME" };
  try {
    const user = await prisma.user.create({ data: { phone: input.phone, name, role: "TECHNICIAN", vendorId: vendorUser.vendorId, createdAt: now } });
    return { ok: true, userId: user.id };
  } catch (error) {
    if (isUniqueViolation(error, "phone")) return { ok: false, error: "ALREADY_REGISTERED" };
    throw error;
  }
}

export async function listTechnicians(vendorId: string) {
  return prisma.user.findMany({ where: { vendorId, role: "TECHNICIAN" }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, createdAt: true } });
}

// ---------- reading ----------

const communityCard = { id: true, name: true, city: true, pincode: true, type: true, unitLabel: true, blockLabel: true } as const;

/** Live communities a new resident can ask to join, by name, city or pincode. */
export async function searchCommunities(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.community.findMany({
    where: { status: "APPROVED", OR: [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { pincode: { startsWith: q } }] },
    orderBy: { name: "asc" },
    take: 8,
    select: communityCard,
  });
}

/** A live community with its flats, by id or invite code, for choosing a flat. */
export async function communityForJoining(by: { id: string } | { code: string }) {
  return prisma.community.findFirst({
    where: { status: "APPROVED", ...("id" in by ? { id: by.id } : { code: by.code.trim().toUpperCase() }) },
    select: { ...communityCard, code: true, flats: { orderBy: [{ tower: "asc" }, { number: "asc" }], select: { id: true, tower: true, number: true } } },
  });
}

export type JoinCommunity = NonNullable<Awaited<ReturnType<typeof communityForJoining>>>;

/** A resident's latest request (pending, or the last one decided), for their waiting screen. */
export async function latestJoinRequest(userId: string) {
  return prisma.joinRequest.findFirst({
    where: { userId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, note: true, createdAt: true, decidedAt: true, community: { select: { id: true, name: true, unitLabel: true } }, flat: { select: { tower: true, number: true } } },
  });
}

/** Requests waiting for a community's managers, oldest first, and who already lives there. */
export async function communityResidents(communityId: string) {
  const [pending, members] = await Promise.all([
    prisma.joinRequest.findMany({
      where: { communityId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, user: { select: { name: true, phone: true } }, flat: { select: { tower: true, number: true } } },
    }),
    prisma.user.findMany({
      where: { role: "RESIDENT", flat: { communityId } },
      orderBy: [{ flat: { tower: "asc" } }, { flat: { number: "asc" } }],
      select: { id: true, name: true, flat: { select: { tower: true, number: true } } },
    }),
  ]);
  return { pending, members };
}

/** Communities and vendors waiting for a platform admin, oldest first, plus the latest decisions. */
export async function verificationQueues() {
  const [communities, vendors] = await Promise.all([
    prisma.community.findMany({
      orderBy: { createdAt: "asc" },
      where: { status: "PENDING" },
      select: {
        ...communityCard,
        address: true,
        createdAt: true,
        _count: { select: { flats: true } },
        registeredBy: { select: { name: true, phone: true } },
      },
    }),
    prisma.vendor.findMany({
      orderBy: { createdAt: "asc" },
      where: { verificationStatus: "PENDING" },
      select: {
        id: true,
        name: true,
        city: true,
        phone: true,
        gstin: true,
        categories: true,
        serviceAreaPincodes: true,
        createdAt: true,
        _count: { select: { products: true, services: true } },
      },
    }),
  ]);
  return { communities, vendors };
}

/** What a vendor's verification checklist is made of. */
export async function vendorStanding(vendorId: string) {
  return prisma.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    select: {
      name: true,
      phone: true,
      city: true,
      gstin: true,
      categories: true,
      serviceAreaPincodes: true,
      verificationStatus: true,
      verificationNote: true,
      _count: { select: { products: true, services: true } },
    },
  });
}

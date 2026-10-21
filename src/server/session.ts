import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { SESSION_TTL_MS, type Role } from "@/lib/auth/rules";

export type SessionUser = {
  id: string;
  name: string | null;
  phone: string;
  role: Role;
  onboardedAt: Date | null;
  /** Residents: the flat they were approved into. */
  flatId: string | null;
  flat: {
    id: string;
    tower: string;
    number: string;
    community: SessionCommunity;
  } | null;
  /** Society Managers: the community they run. */
  staff: { kind: "PRIMARY" | "ASSISTANT"; community: SessionCommunity } | null;
  /** Vendors and their technicians. */
  vendor: { id: string; name: string; kind: "GOODS" | "SERVICES"; verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" } | null;
};

export type SessionCommunity = {
  id: string;
  name: string;
  code: string;
  city: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  /** What a flat and a tower are called here, e.g. "Room" and "Wing" in a PG. */
  unitLabel: string;
  blockLabel: string;
};

export type ResidentUser = SessionUser & { flatId: string; flat: NonNullable<SessionUser["flat"]> };
export type ManagerUser = SessionUser & { staff: NonNullable<SessionUser["staff"]> };
export type VendorUser = SessionUser & { vendor: NonNullable<SessionUser["vendor"]> };

const communitySelect = { id: true, name: true, code: true, city: true, status: true, unitLabel: true, blockLabel: true } as const;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session. Only the token's hash is stored, so a database leak can't be replayed as logins. */
export async function createSession(userId: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt, createdAt: now } });
  return { token, expiresAt };
}

export async function findSessionUser(token: string, now: Date): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          flat: { include: { community: { select: communitySelect } } },
          staffRole: { select: { kind: true, community: { select: communitySelect } } },
          vendor: { select: { id: true, name: true, kind: true, verificationStatus: true } },
        },
      },
    },
  });
  if (!session || session.expiresAt.getTime() <= now.getTime()) return null;
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    onboardedAt: user.onboardedAt,
    flatId: user.flatId,
    flat: user.flat
      ? { id: user.flat.id, tower: user.flat.tower, number: user.flat.number, community: user.flat.community }
      : null,
    staff: user.staffRole,
    vendor: user.vendor,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

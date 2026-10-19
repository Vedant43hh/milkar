import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { SESSION_TTL_MS, type Role } from "@/lib/auth/rules";

export type SessionUser = {
  id: string;
  name: string | null;
  phone: string;
  role: Role;
  flatId: string | null;
  flat: {
    id: string;
    tower: string;
    number: string;
    community: SessionCommunity;
  } | null;
  vendor: { id: string; name: string; kind: "GOODS" | "SERVICES" } | null;
};

export type SessionCommunity = {
  id: string;
  name: string;
  code: string;
  city: string;
  /** What a flat and a tower are called here, e.g. "Room" and "Wing" in a PG. */
  unitLabel: string;
  blockLabel: string;
};

export type ResidentUser = SessionUser & { flatId: string; flat: NonNullable<SessionUser["flat"]> };

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
          flat: {
            include: {
              community: { select: { id: true, name: true, code: true, city: true, unitLabel: true, blockLabel: true } },
            },
          },
          vendor: { select: { id: true, name: true, kind: true } },
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
    flatId: user.flatId,
    flat: user.flat
      ? { id: user.flat.id, tower: user.flat.tower, number: user.flat.number, community: user.flat.community }
      : null,
    vendor: user.vendor,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

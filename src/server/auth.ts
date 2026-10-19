import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DEMO_USERS, type DemoUserKey } from "@/lib/demo";

/** Finds the user for a verified phone number, creating a resident account on first login. */
export async function findOrCreateUserByPhone(phone: string) {
  return prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, role: "RESIDENT" },
    select: { id: true, role: true, flatId: true },
  });
}

export type DemoLoginResult =
  | { ok: true; user: { id: string; role: "RESIDENT" | "CAPTAIN" | "VENDOR" | "ADMIN"; flatId: string | null } }
  | { ok: false; error: "DEMO_DISABLED" | "UNKNOWN_DEMO_USER" };

/** Resolves a seeded demo account. Refuses unless demo mode is on; callers pass the live setting. */
export async function resolveDemoLogin(key: string, demoMode: boolean): Promise<DemoLoginResult> {
  if (!demoMode) return { ok: false, error: "DEMO_DISABLED" };
  const demo = DEMO_USERS[key as DemoUserKey];
  if (!demo) return { ok: false, error: "UNKNOWN_DEMO_USER" };
  const user = await prisma.user.findUnique({ where: { phone: demo.phone }, select: { id: true, role: true, flatId: true } });
  return user ? { ok: true, user } : { ok: false, error: "UNKNOWN_DEMO_USER" };
}

/** Public details shown on an invite link. */
export async function getCommunityInvite(code: string) {
  return prisma.community.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      id: true,
      name: true,
      city: true,
      code: true,
      blockLabel: true,
      unitLabel: true,
      flats: { select: { id: true, tower: true, number: true } },
    },
  });
}

export const joinSchema = z.object({
  name: z.string().trim().min(2).max(60),
  flatId: z.string().min(1),
});

export type JoinResult =
  | { ok: true; communityId: string; communityName: string }
  | { ok: false; error: "UNKNOWN_COMMUNITY" | "UNKNOWN_FLAT" | "ALREADY_MEMBER" | "NOT_RESIDENT" };

/** Attaches a resident without a flat to a flat in the community the invite code belongs to. */
export async function joinCommunity(input: { userId: string; communityCode: string; flatId: string; name: string }): Promise<JoinResult> {
  const community = await prisma.community.findUnique({ where: { code: input.communityCode.toUpperCase() }, select: { id: true, name: true } });
  if (!community) return { ok: false, error: "UNKNOWN_COMMUNITY" };
  const flat = await prisma.flat.findFirst({ where: { id: input.flatId, communityId: community.id }, select: { id: true } });
  if (!flat) return { ok: false, error: "UNKNOWN_FLAT" };

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { role: true, flatId: true } });
  if (!user || (user.role !== "RESIDENT" && user.role !== "CAPTAIN")) return { ok: false, error: "NOT_RESIDENT" };
  if (user.flatId) return { ok: false, error: "ALREADY_MEMBER" };

  // Conditional update so two concurrent joins can't both succeed.
  const updated = await prisma.user.updateMany({
    where: { id: input.userId, flatId: null },
    data: { flatId: flat.id, name: input.name.trim() },
  });
  return updated.count === 1 ? { ok: true, communityId: community.id, communityName: community.name } : { ok: false, error: "ALREADY_MEMBER" };
}

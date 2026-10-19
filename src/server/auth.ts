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
  | { ok: true; user: { id: string; role: "RESIDENT" | "CAPTAIN" | "SUPPLIER" | "ADMIN"; flatId: string | null } }
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
export async function getSocietyInvite(code: string) {
  return prisma.society.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      id: true,
      name: true,
      city: true,
      code: true,
      flats: { select: { id: true, tower: true, number: true } },
    },
  });
}

export const joinSchema = z.object({
  name: z.string().trim().min(2).max(60),
  flatId: z.string().min(1),
});

export type JoinResult =
  | { ok: true; societyId: string; societyName: string }
  | { ok: false; error: "UNKNOWN_SOCIETY" | "UNKNOWN_FLAT" | "ALREADY_MEMBER" | "NOT_RESIDENT" };

/** Attaches a resident without a flat to a flat in the society the invite code belongs to. */
export async function joinSociety(input: { userId: string; societyCode: string; flatId: string; name: string }): Promise<JoinResult> {
  const society = await prisma.society.findUnique({ where: { code: input.societyCode.toUpperCase() }, select: { id: true, name: true } });
  if (!society) return { ok: false, error: "UNKNOWN_SOCIETY" };
  const flat = await prisma.flat.findFirst({ where: { id: input.flatId, societyId: society.id }, select: { id: true } });
  if (!flat) return { ok: false, error: "UNKNOWN_FLAT" };

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { role: true, flatId: true } });
  if (!user || (user.role !== "RESIDENT" && user.role !== "CAPTAIN")) return { ok: false, error: "NOT_RESIDENT" };
  if (user.flatId) return { ok: false, error: "ALREADY_MEMBER" };

  // Conditional update so two concurrent joins can't both succeed.
  const updated = await prisma.user.updateMany({
    where: { id: input.userId, flatId: null },
    data: { flatId: flat.id, name: input.name.trim() },
  });
  return updated.count === 1 ? { ok: true, societyId: society.id, societyName: society.name } : { ok: false, error: "ALREADY_MEMBER" };
}

import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/auth/rules";
import { DEMO_USERS, type DemoUserKey } from "@/lib/demo";

/**
 * The account for a verified phone number, or null. Logging in never creates an account: new
 * people register (and say who they are) first.
 */
export async function findUserByPhone(phone: string): Promise<{ id: string; role: Role; flatId: string | null } | null> {
  return prisma.user.findUnique({ where: { phone }, select: { id: true, role: true, flatId: true } });
}

export async function isPhoneRegistered(phone: string): Promise<boolean> {
  return (await prisma.user.count({ where: { phone } })) > 0;
}

export type DemoLoginResult =
  | { ok: true; user: { id: string; role: Role; flatId: string | null } }
  | { ok: false; error: "DEMO_DISABLED" | "UNKNOWN_DEMO_USER" };

/** Resolves a seeded demo account. Refuses unless demo mode is on; callers pass the live setting. */
export async function resolveDemoLogin(key: string, demoMode: boolean): Promise<DemoLoginResult> {
  if (!demoMode) return { ok: false, error: "DEMO_DISABLED" };
  const demo = DEMO_USERS[key as DemoUserKey];
  if (!demo) return { ok: false, error: "UNKNOWN_DEMO_USER" };
  const user = await prisma.user.findUnique({ where: { phone: demo.phone }, select: { id: true, role: true, flatId: true } });
  return user ? { ok: true, user } : { ok: false, error: "UNKNOWN_DEMO_USER" };
}

// Data access layer for authentication. Every page and server action checks access through here;
// the proxy only redirects requests that have no session cookie at all.
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { canAccess, homePathFor, SESSION_COOKIE, type Area } from "@/lib/auth/rules";
import { createSession, deleteSession, findSessionUser, type ResidentUser, type SessionUser } from "@/server/session";

export type { ResidentUser, SessionUser };

/** The signed-in user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Sessions depend on the request and the current time, so never resolve them during a prerender.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSessionUser(token, new Date());
});

export function loginPath(next?: string): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(next));
  return user;
}

/** Signed-in user allowed in `area`; anyone else is sent to their own home page. */
export async function requireArea(area: "resident" | "captain"): Promise<ResidentUser>;
export async function requireArea(area: Area): Promise<SessionUser>;
export async function requireArea(area: Area): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccess(user, area)) redirect(homePathFor(user));
  return user;
}

/** Admins may see any society; residents and captains only their own. */
export async function requireSocietyAccess(societyId: string): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (user.flat?.society.id !== societyId) redirect(homePathFor(user));
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId, new Date());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}

// Data access layer for authentication. Every page and server action checks access through here;
// the proxy only redirects requests that have no session cookie at all.
import "server-only";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { canEnter, PORTAL_PATH, SESSION_COOKIE, type Portal } from "@/lib/auth/rules";
import { createSession, deleteSession, findSessionUser, type ManagerUser, type ResidentUser, type SessionUser, type VendorUser } from "@/server/session";

export type { ManagerUser, ResidentUser, SessionUser, VendorUser };

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

/**
 * The signed-in user of this portal's role, or a 403: the portal's forbidden.tsx tells them whose
 * area this is and links to their own. Signed-out visitors go to the login page. Call it in every
 * page, server action and route handler of the portal.
 */
export async function requirePortalUser(portal: Portal): Promise<SessionUser> {
  const user = await requireUser(PORTAL_PATH[portal]);
  if (!canEnter(user, portal)) forbidden();
  return user;
}

/**
 * The same, for an account that is fully set up for its portal. Accounts still being set up are
 * sent to the step that finishes it: residents to joining a community, Society Managers to the
 * status of their community's approval.
 */
export async function requirePortal(portal: "app"): Promise<ResidentUser>;
export async function requirePortal(portal: "manager"): Promise<ManagerUser>;
export async function requirePortal(portal: "vendor" | "tech"): Promise<VendorUser>;
export async function requirePortal(portal: Portal): Promise<SessionUser>;
export async function requirePortal(portal: Portal): Promise<SessionUser> {
  const user = await requirePortalUser(portal);
  if (portal === "app" && !user.flat) redirect("/join");
  if (portal === "manager" && user.staff?.community.status !== "APPROVED") redirect("/manager/pending");
  if ((portal === "vendor" || portal === "tech") && !user.vendor) forbidden();
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

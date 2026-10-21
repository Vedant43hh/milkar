// Pure auth rules: rate limits, which portal each role uses, and safe redirects.

export type Role = "RESIDENT" | "MANAGER" | "VENDOR" | "TECHNICIAN" | "ADMIN";
export const ROLES: readonly Role[] = ["RESIDENT", "MANAGER", "VENDOR", "TECHNICIAN", "ADMIN"];

export const SESSION_COOKIE = "milkar_session";
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const RATE_WINDOW_SHORT_MS = 15 * 60 * 1000;
export const RATE_WINDOW_DAY_MS = 24 * 60 * 60 * 1000;

export type OtpLimits = {
  phone15m: number;
  phoneDay: number;
  ip15m: number;
  ipDay: number;
};

export type OtpCounts = OtpLimits;

export type RateLimitHit = { scope: "phone" | "ip"; window: "15m" | "day" };

/** Which limit a new OTP request would break, given requests already made in each window. */
export function otpRateLimit(counts: OtpCounts, limits: OtpLimits): RateLimitHit | null {
  if (counts.phoneDay >= limits.phoneDay) return { scope: "phone", window: "day" };
  if (counts.phone15m >= limits.phone15m) return { scope: "phone", window: "15m" };
  if (counts.ipDay >= limits.ipDay) return { scope: "ip", window: "day" };
  if (counts.ip15m >= limits.ip15m) return { scope: "ip", window: "15m" };
  return null;
}

// ---------- portals ----------

/** Each role has exactly one portal, and nobody can enter another role's portal. */
export type Portal = "app" | "manager" | "vendor" | "tech" | "admin";
export const PORTALS: readonly Portal[] = ["app", "manager", "vendor", "tech", "admin"];

const PORTAL_OF_ROLE: Record<Role, Portal> = {
  RESIDENT: "app",
  MANAGER: "manager",
  VENDOR: "vendor",
  TECHNICIAN: "tech",
  ADMIN: "admin",
};

export const PORTAL_PATH: Record<Portal, string> = {
  app: "/app",
  manager: "/manager",
  vendor: "/vendor",
  tech: "/tech",
  admin: "/admin",
};

export function portalFor(role: Role): Portal {
  return PORTAL_OF_ROLE[role];
}

export function canEnter(user: { role: Role }, portal: Portal): boolean {
  return portalFor(user.role) === portal;
}

/** Where a user lands after login: their own portal. */
export function homePathFor(user: { role: Role }): string {
  return PORTAL_PATH[portalFor(user.role)];
}

/** The portal a path belongs to, or null for public pages (landing, login, join). */
export function portalOfPath(pathname: string): Portal | null {
  return PORTALS.find((p) => pathname === PORTAL_PATH[p] || pathname.startsWith(`${PORTAL_PATH[p]}/`)) ?? null;
}

/**
 * Who runs a community's rounds, polls and residents: its Society Managers (primary or assistant),
 * and platform admins. `communityId` is the community the user manages, not where they live.
 */
export function canManageCommunity(user: { role: Role; communityId: string | null }, communityId: string): boolean {
  return user.role === "ADMIN" || (user.role === "MANAGER" && user.communityId === communityId);
}

/** Only same-site paths are allowed as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  if (next.startsWith("/login")) return null;
  return next;
}

/** Client IP from proxy headers. On Vercel the platform sets x-forwarded-for. */
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

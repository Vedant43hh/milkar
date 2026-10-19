// Pure auth rules: rate limits, where each role lands, and safe redirects.

export type Role = "RESIDENT" | "CAPTAIN" | "VENDOR" | "ADMIN";

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

export type HomeUser = { role: Role; flatId: string | null };

/** Where a user lands after login. Residents without a flat must join a community first. */
export function homePathFor(user: HomeUser): string {
  switch (user.role) {
    case "ADMIN":
      return "/admin";
    case "VENDOR":
      return "/vendor";
    default:
      return user.flatId ? "/" : "/join";
  }
}

export type Area = "resident" | "captain" | "vendor" | "admin";

export function canAccess(user: HomeUser, area: Area): boolean {
  switch (area) {
    case "resident":
      return (user.role === "RESIDENT" || user.role === "CAPTAIN") && user.flatId !== null;
    case "captain":
      return user.role === "CAPTAIN" && user.flatId !== null;
    case "vendor":
      return user.role === "VENDOR";
    case "admin":
      return user.role === "ADMIN";
  }
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

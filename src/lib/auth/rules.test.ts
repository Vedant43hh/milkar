import { describe, expect, it } from "vitest";
import { canAccess, clientIpFrom, homePathFor, otpRateLimit, safeNextPath } from "./rules";

const limits = { phone15m: 3, phoneDay: 10, ip15m: 30, ipDay: 200 };
const none = { phone15m: 0, phoneDay: 0, ip15m: 0, ipDay: 0 };

describe("otpRateLimit", () => {
  it("allows requests under every limit", () => {
    expect(otpRateLimit(none, limits)).toBeNull();
    expect(otpRateLimit({ phone15m: 2, phoneDay: 9, ip15m: 29, ipDay: 199 }, limits)).toBeNull();
  });

  it("blocks at each limit", () => {
    expect(otpRateLimit({ ...none, phone15m: 3, phoneDay: 3 }, limits)).toEqual({ scope: "phone", window: "15m" });
    expect(otpRateLimit({ ...none, phoneDay: 10 }, limits)).toEqual({ scope: "phone", window: "day" });
    expect(otpRateLimit({ ...none, ip15m: 30, ipDay: 30 }, limits)).toEqual({ scope: "ip", window: "15m" });
    expect(otpRateLimit({ ...none, ipDay: 200 }, limits)).toEqual({ scope: "ip", window: "day" });
  });

  it("reports the daily window first when both are exceeded", () => {
    expect(otpRateLimit({ ...none, phone15m: 3, phoneDay: 10 }, limits)?.window).toBe("day");
  });
});

describe("homePathFor / canAccess", () => {
  it("sends each role to its home", () => {
    expect(homePathFor({ role: "ADMIN", flatId: null })).toBe("/admin");
    expect(homePathFor({ role: "SUPPLIER", flatId: null })).toBe("/supplier");
    expect(homePathFor({ role: "RESIDENT", flatId: "f1" })).toBe("/");
    expect(homePathFor({ role: "CAPTAIN", flatId: "f1" })).toBe("/");
    expect(homePathFor({ role: "RESIDENT", flatId: null })).toBe("/join");
  });

  it("lets captains use resident pages but not the reverse", () => {
    const captain = { role: "CAPTAIN" as const, flatId: "f1" };
    const resident = { role: "RESIDENT" as const, flatId: "f1" };
    expect(canAccess(captain, "resident")).toBe(true);
    expect(canAccess(captain, "captain")).toBe(true);
    expect(canAccess(resident, "captain")).toBe(false);
    expect(canAccess({ role: "RESIDENT", flatId: null }, "resident")).toBe(false);
  });

  it("keeps suppliers and admins in their own areas", () => {
    expect(canAccess({ role: "SUPPLIER", flatId: null }, "supplier")).toBe(true);
    expect(canAccess({ role: "SUPPLIER", flatId: null }, "admin")).toBe(false);
    expect(canAccess({ role: "ADMIN", flatId: null }, "resident")).toBe(false);
    expect(canAccess({ role: "ADMIN", flatId: null }, "admin")).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/join/GREENMDW?round=abc")).toBe("/join/GREENMDW?round=abc");
    expect(safeNextPath("/orders")).toBe("/orders");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", "/login?next=/x", "/a\nb"])(
    "rejects %s",
    (next) => {
      expect(safeNextPath(next)).toBeNull();
    },
  );

  it("handles missing values", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("clientIpFrom", () => {
  const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k] ?? null });

  it("uses the first x-forwarded-for entry", () => {
    expect(clientIpFrom(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIpFrom(headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIpFrom(headers({}))).toBe("unknown");
  });
});

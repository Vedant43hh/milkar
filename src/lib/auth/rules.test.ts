import { describe, expect, it } from "vitest";
import { canEnter, canManageCommunity, clientIpFrom, homePathFor, otpRateLimit, PORTALS, portalFor, portalOfPath, ROLES, safeNextPath, type Portal, type Role } from "./rules";

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

describe("portals", () => {
  const own: Record<Role, Portal> = { RESIDENT: "app", MANAGER: "manager", VENDOR: "vendor", TECHNICIAN: "tech", ADMIN: "admin" };

  it("gives every role exactly one portal, and lands them there after login", () => {
    for (const role of ROLES) {
      expect(portalFor(role)).toBe(own[role]);
      expect(homePathFor({ role })).toBe(`/${own[role]}`);
    }
  });

  // Every role against every portal: only its own is allowed. Society Managers don't get the
  // resident app either: one portal per account.
  it.each(ROLES.flatMap((role) => PORTALS.map((portal) => [role, portal] as const)))("%s in /%s", (role, portal) => {
    expect(canEnter({ role }, portal)).toBe(own[role] === portal);
  });

  it("knows which portal a path belongs to", () => {
    expect(portalOfPath("/app")).toBe("app");
    expect(portalOfPath("/app/services/r1")).toBe("app");
    expect(portalOfPath("/manager/rounds/new")).toBe("manager");
    expect(portalOfPath("/tech/upcoming")).toBe("tech");
    expect(portalOfPath("/vendor")).toBe("vendor");
    expect(portalOfPath("/admin/notifications")).toBe("admin");
    for (const publicPath of ["/", "/login", "/join/GREENMDW", "/application", "/technician", "/round/r1"]) expect(portalOfPath(publicPath)).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/join/GREENMDW?round=abc")).toBe("/join/GREENMDW?round=abc");
    expect(safeNextPath("/app/orders")).toBe("/app/orders");
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

describe("canManageCommunity", () => {
  it("lets managers run only their own community, and admins any", () => {
    expect(canManageCommunity({ role: "MANAGER", communityId: "c1" }, "c1")).toBe(true);
    expect(canManageCommunity({ role: "MANAGER", communityId: "c1" }, "c2")).toBe(false);
    expect(canManageCommunity({ role: "RESIDENT", communityId: "c1" }, "c1")).toBe(false);
    expect(canManageCommunity({ role: "VENDOR", communityId: null }, "c1")).toBe(false);
    expect(canManageCommunity({ role: "ADMIN", communityId: null }, "c2")).toBe(true);
  });
});

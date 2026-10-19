import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { OTP_MAX_ATTEMPTS, SESSION_TTL_MS } from "@/lib/auth/rules";
import { DEMO_USERS } from "@/lib/demo";
import { findOrCreateUserByPhone, joinSociety, resolveDemoLogin } from "@/server/auth";
import { hashOtp, requestOtp, verifyOtp } from "@/server/otp";
import { createSession, deleteSession, findSessionUser, hashSessionToken } from "@/server/session";
import { truncateAll } from "../../prisma/truncate";
import { makeSociety, nextPhone } from "./helpers";

const limits = { phone15m: 3, phoneDay: 10, ip15m: 30, ipDay: 200 };
const MIN = 60_000;
const t0 = new Date("2026-10-20T06:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * MIN);

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

beforeEach(async () => {
  await truncateAll(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const request = (phone: string, now: Date, ip = "203.0.113.1") => requestOtp({ phone, ip, now, mode: "mock", limits });

describe("OTP rate limits", () => {
  it("allows 3 codes per phone per 15 minutes, then again once the window passes", async () => {
    const phone = nextPhone();
    for (const minute of [0, 1, 2]) expect((await request(phone, at(minute))).ok).toBe(true);
    expect(await request(phone, at(3))).toEqual({ ok: false, error: "RATE_LIMITED", hit: { scope: "phone", window: "15m" } });
    expect((await request(phone, at(16))).ok).toBe(true); // the first request has left the window
  });

  it("caps a phone at 10 codes per day", async () => {
    const phone = nextPhone();
    for (let i = 0; i < 10; i++) expect((await request(phone, at(i * 20))).ok).toBe(true);
    expect(await request(phone, at(10 * 20))).toMatchObject({ ok: false, hit: { scope: "phone", window: "day" } });
    expect((await request(phone, at(24 * 60 + 1))).ok).toBe(true);
  });

  it("caps one network at 30 codes per 15 minutes across different phones", async () => {
    for (let i = 0; i < 30; i++) expect((await request(nextPhone(), at(0), "198.51.100.9")).ok).toBe(true);
    expect(await request(nextPhone(), at(1), "198.51.100.9")).toMatchObject({ ok: false, hit: { scope: "ip", window: "15m" } });
    expect((await request(nextPhone(), at(1), "198.51.100.10")).ok).toBe(true); // another network is unaffected
  });

  it("does not issue codes when no SMS provider is configured", async () => {
    const result = await requestOtp({ phone: nextPhone(), ip: "x", now: at(0), mode: "sms", limits });
    expect(result).toEqual({ ok: false, error: "OTP_PROVIDER_UNAVAILABLE" });
    expect(await prisma.otpRequest.count()).toBe(0);
  });
});

describe("verifyOtp", () => {
  it("accepts any 6 digits in mock mode, once", async () => {
    const phone = nextPhone();
    await request(phone, at(0));
    expect(await verifyOtp({ phone, code: "424242", now: at(1), mode: "mock" })).toEqual({ ok: true });
    expect(await verifyOtp({ phone, code: "424242", now: at(2), mode: "mock" })).toEqual({ ok: false, error: "NO_ACTIVE_CODE" });
  });

  it("rejects malformed codes without using an attempt", async () => {
    const phone = nextPhone();
    await request(phone, at(0));
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      expect(await verifyOtp({ phone, code, now: at(1), mode: "mock" })).toEqual({ ok: false, error: "INVALID_FORMAT" });
    }
    expect((await prisma.otpRequest.findFirstOrThrow({ where: { phone } })).attempts).toBe(0);
  });

  it("rejects codes that were never requested or have expired", async () => {
    const phone = nextPhone();
    expect(await verifyOtp({ phone, code: "123456", now: at(0), mode: "mock" })).toEqual({ ok: false, error: "NO_ACTIVE_CODE" });
    await request(phone, at(0));
    expect(await verifyOtp({ phone, code: "123456", now: at(10), mode: "mock" })).toEqual({ ok: false, error: "NO_ACTIVE_CODE" });
  });

  it("checks the real code outside mock mode and locks after 5 wrong attempts", async () => {
    const phone = nextPhone();
    await prisma.otpRequest.create({
      data: { phone, ip: "x", codeHash: hashOtp(phone, "135790"), expiresAt: at(10), createdAt: at(0) },
    });
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyOtp({ phone, code: "000000", now: at(1), mode: "sms" })).toEqual({
        ok: false,
        error: "WRONG_CODE",
        attemptsLeft: OTP_MAX_ATTEMPTS - i,
      });
    }
    expect(await verifyOtp({ phone, code: "000000", now: at(1), mode: "sms" })).toEqual({ ok: false, error: "TOO_MANY_ATTEMPTS" });
    // Even the right code is refused once the attempts are used up.
    expect(await verifyOtp({ phone, code: "135790", now: at(1), mode: "sms" })).toEqual({ ok: false, error: "TOO_MANY_ATTEMPTS" });
  });

  it("accepts the real code outside mock mode", async () => {
    const phone = nextPhone();
    await prisma.otpRequest.create({
      data: { phone, ip: "x", codeHash: hashOtp(phone, "246810"), expiresAt: at(10), createdAt: at(0) },
    });
    expect(await verifyOtp({ phone, code: "246810", now: at(1), mode: "sms" })).toEqual({ ok: true });
  });
});

describe("accounts and sessions", () => {
  it("creates a resident account on first login and reuses it after", async () => {
    const phone = nextPhone();
    const first = await findOrCreateUserByPhone(phone);
    const second = await findOrCreateUserByPhone(phone);
    expect(first).toEqual({ id: second.id, role: "RESIDENT", flatId: null });
    expect(await prisma.user.count()).toBe(1);
  });

  it("stores only a hash of the session token and expires sessions", async () => {
    const user = await findOrCreateUserByPhone(nextPhone());
    const { token, expiresAt } = await createSession(user.id, t0);
    expect(expiresAt.getTime()).toBe(t0.getTime() + SESSION_TTL_MS);

    const stored = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(hashSessionToken(token));
    expect(stored.tokenHash).not.toContain(token);

    expect((await findSessionUser(token, at(5)))?.id).toBe(user.id);
    expect(await findSessionUser(token, expiresAt)).toBeNull();
    expect(await findSessionUser("not-a-real-token", at(5))).toBeNull();

    await deleteSession(token);
    expect(await findSessionUser(token, at(5))).toBeNull();
  });

  it("includes flat and society details for residents", async () => {
    const society = await makeSociety("SESS1");
    const user = await prisma.user.create({ data: { phone: nextPhone(), name: "Asha", flatId: society.flats[0].id } });
    const { token } = await createSession(user.id, t0);
    expect(await findSessionUser(token, at(1))).toMatchObject({
      name: "Asha",
      role: "RESIDENT",
      flat: { tower: "A", number: "101", society: { code: "SESS1", name: "SESS1 CHS" } },
    });
  });
});

describe("demo login", () => {
  it("is refused when DEMO_MODE is off", async () => {
    await prisma.user.create({ data: { phone: DEMO_USERS.admin.phone, role: "ADMIN" } });
    expect(await resolveDemoLogin("admin", false)).toEqual({ ok: false, error: "DEMO_DISABLED" });
  });

  it("resolves seeded demo users when DEMO_MODE is on", async () => {
    const admin = await prisma.user.create({ data: { phone: DEMO_USERS.admin.phone, role: "ADMIN" } });
    expect(await resolveDemoLogin("admin", true)).toEqual({ ok: true, user: { id: admin.id, role: "ADMIN", flatId: null } });
    expect(await resolveDemoLogin("nobody", true)).toEqual({ ok: false, error: "UNKNOWN_DEMO_USER" });
    expect(await resolveDemoLogin("captain", true)).toEqual({ ok: false, error: "UNKNOWN_DEMO_USER" }); // not seeded here
  });
});

describe("joinSociety", () => {
  it("puts a new resident in a flat of the invited society", async () => {
    const society = await makeSociety("JOIN1");
    const user = await findOrCreateUserByPhone(nextPhone());
    const result = await joinSociety({ userId: user.id, societyCode: "join1", flatId: society.flats[1].id, name: "  Ravi Kumar " });
    expect(result).toEqual({ ok: true, societyId: society.id, societyName: "JOIN1 CHS" });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ name: "Ravi Kumar", flatId: society.flats[1].id });
  });

  it("rejects flats from another society, unknown codes, existing members and non-residents", async () => {
    const mine = await makeSociety("JOIN2");
    const other = await makeSociety("JOIN3");
    const user = await findOrCreateUserByPhone(nextPhone());
    expect(await joinSociety({ userId: user.id, societyCode: "JOIN2", flatId: other.flats[0].id, name: "Ravi" })).toEqual({ ok: false, error: "UNKNOWN_FLAT" });
    expect(await joinSociety({ userId: user.id, societyCode: "NOPE", flatId: mine.flats[0].id, name: "Ravi" })).toEqual({ ok: false, error: "UNKNOWN_SOCIETY" });

    await joinSociety({ userId: user.id, societyCode: "JOIN2", flatId: mine.flats[0].id, name: "Ravi" });
    expect(await joinSociety({ userId: user.id, societyCode: "JOIN2", flatId: mine.flats[1].id, name: "Ravi" })).toEqual({ ok: false, error: "ALREADY_MEMBER" });

    const supplier = await prisma.user.create({ data: { phone: nextPhone(), role: "SUPPLIER" } });
    expect(await joinSociety({ userId: supplier.id, societyCode: "JOIN2", flatId: mine.flats[0].id, name: "S" })).toEqual({ ok: false, error: "NOT_RESIDENT" });
  });

  it("lets only one of two simultaneous joins succeed", async () => {
    const society = await makeSociety("JOIN4");
    const user = await findOrCreateUserByPhone(nextPhone());
    const results = await Promise.all(
      society.flats.map((flat) => joinSociety({ userId: user.id, societyCode: "JOIN4", flatId: flat.id, name: "Ravi" })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

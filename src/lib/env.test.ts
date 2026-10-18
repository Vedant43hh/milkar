import { describe, expect, it } from "vitest";
import { bootGuardError, parseEnv } from "./env";

const base = { DATABASE_URL: "postgresql://x" };

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      OTP_MODE: "mock",
      DEMO_MODE: false,
      OTP_LIMIT_PHONE_15M: 3,
      OTP_LIMIT_IP_DAY: 200,
    });
    expect(env.RAZORPAY_KEY_ID).toBeUndefined();
  });

  it("treats empty strings as unset and parses booleans and numbers", () => {
    const env = parseEnv({ ...base, RAZORPAY_KEY_ID: "", DEMO_MODE: "true", OTP_LIMIT_IP_15M: "50" });
    expect(env.RAZORPAY_KEY_ID).toBeUndefined();
    expect(env.DEMO_MODE).toBe(true);
    expect(env.OTP_LIMIT_IP_15M).toBe(50);
  });

  it("rejects a missing database URL and bad values", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...base, OTP_MODE: "carrier-pigeon" })).toThrow(/OTP_MODE/);
    expect(() => parseEnv({ ...base, OTP_LIMIT_PHONE_15M: "0" })).toThrow();
  });
});

describe("bootGuardError", () => {
  it("refuses mock OTP in production without DEMO_MODE", () => {
    expect(bootGuardError({ NODE_ENV: "production", OTP_MODE: "mock", DEMO_MODE: false })).toMatch(/Refusing/);
  });

  it("allows mock OTP in production for an explicit demo", () => {
    expect(bootGuardError({ NODE_ENV: "production", OTP_MODE: "mock", DEMO_MODE: true })).toBeNull();
  });

  it("allows mock OTP outside production and real OTP anywhere", () => {
    expect(bootGuardError({ NODE_ENV: "development", OTP_MODE: "mock", DEMO_MODE: false })).toBeNull();
    expect(bootGuardError({ NODE_ENV: "production", OTP_MODE: "sms", DEMO_MODE: false })).toBeNull();
  });
});

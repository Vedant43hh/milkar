import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  RATE_WINDOW_DAY_MS,
  RATE_WINDOW_SHORT_MS,
  otpRateLimit,
  type OtpLimits,
  type RateLimitHit,
} from "@/lib/auth/rules";

export type OtpMode = "mock" | "sms";

export function hashOtp(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export type RequestOtpResult =
  | { ok: true }
  | { ok: false; error: "RATE_LIMITED"; hit: RateLimitHit }
  | { ok: false; error: "OTP_PROVIDER_UNAVAILABLE" };

/**
 * Issues a 6-digit code for a phone number, subject to per-phone and per-IP rate limits.
 * In mock mode the code is printed to the server console instead of being sent by SMS.
 */
export async function requestOtp(input: {
  phone: string;
  ip: string;
  now: Date;
  mode: OtpMode;
  limits: OtpLimits;
}): Promise<RequestOtpResult> {
  const { phone, ip, now } = input;
  const shortSince = new Date(now.getTime() - RATE_WINDOW_SHORT_MS);
  const daySince = new Date(now.getTime() - RATE_WINDOW_DAY_MS);
  const [phone15m, phoneDay, ip15m, ipDay] = await Promise.all([
    prisma.otpRequest.count({ where: { phone, createdAt: { gt: shortSince } } }),
    prisma.otpRequest.count({ where: { phone, createdAt: { gt: daySince } } }),
    prisma.otpRequest.count({ where: { ip, createdAt: { gt: shortSince } } }),
    prisma.otpRequest.count({ where: { ip, createdAt: { gt: daySince } } }),
  ]);
  const hit = otpRateLimit({ phone15m, phoneDay, ip15m, ipDay }, input.limits);
  if (hit) return { ok: false, error: "RATE_LIMITED", hit };

  // A real SMS provider plugs in here. Until one is configured, only mock mode can issue codes.
  if (input.mode !== "mock") return { ok: false, error: "OTP_PROVIDER_UNAVAILABLE" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.otpRequest.create({
    data: { phone, ip, codeHash: hashOtp(phone, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), createdAt: now },
  });
  console.info(`[milkar] OTP for ${phone}: ${code} (mock mode: any 6 digits are accepted)`);
  return { ok: true };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; error: "INVALID_FORMAT" | "NO_ACTIVE_CODE" | "TOO_MANY_ATTEMPTS" }
  | { ok: false; error: "WRONG_CODE"; attemptsLeft: number };

/**
 * Checks a code against the newest unexpired, unused request for the phone.
 * Each check uses up an attempt (at most OTP_MAX_ATTEMPTS); a matching code is consumed once.
 * In mock mode any 6 digits match.
 */
export async function verifyOtp(input: { phone: string; code: string; now: Date; mode: OtpMode }): Promise<VerifyOtpResult> {
  const { phone, code, now } = input;
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "INVALID_FORMAT" };

  const request = await prisma.otpRequest.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!request) return { ok: false, error: "NO_ACTIVE_CODE" };

  const counted = await prisma.otpRequest.updateMany({
    where: { id: request.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) return { ok: false, error: "TOO_MANY_ATTEMPTS" };

  const matches =
    input.mode === "mock" ||
    timingSafeEqual(Buffer.from(hashOtp(phone, code), "hex"), Buffer.from(request.codeHash, "hex"));
  if (!matches) {
    const attemptsLeft = OTP_MAX_ATTEMPTS - (request.attempts + 1);
    return attemptsLeft > 0 ? { ok: false, error: "WRONG_CODE", attemptsLeft } : { ok: false, error: "TOO_MANY_ATTEMPTS" };
  }

  const consumed = await prisma.otpRequest.updateMany({
    where: { id: request.id, consumedAt: null },
    data: { consumedAt: now },
  });
  return consumed.count === 1 ? { ok: true } : { ok: false, error: "NO_ACTIVE_CODE" };
}

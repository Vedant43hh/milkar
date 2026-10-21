import "server-only";
import { headers } from "next/headers";
import { t, type MessageKey } from "@/i18n";
import { clientIpFrom, type RateLimitHit } from "@/lib/auth/rules";
import { getEnv } from "@/lib/env";
import { requestOtp, verifyOtp } from "./otp";

// Sending and checking login codes for the login and registration forms, with errors already in
// words. (A plain module, not "use server": none of this is callable from the browser directly.)

const RATE_LIMIT_MESSAGES: Record<`${RateLimitHit["scope"]}:${RateLimitHit["window"]}`, MessageKey> = {
  "phone:15m": "errors.rateLimitedPhone15m",
  "phone:day": "errors.rateLimitedPhoneDay",
  "ip:15m": "errors.rateLimitedIp15m",
  "ip:day": "errors.rateLimitedIpDay",
};

/** Sends a code to `phone` (E.164). Returns an error message, or null when it was sent. */
export async function issueCode(phone: string): Promise<string | null> {
  const env = getEnv();
  const result = await requestOtp({
    phone,
    ip: clientIpFrom(await headers()),
    now: new Date(),
    mode: env.OTP_MODE,
    limits: { phone15m: env.OTP_LIMIT_PHONE_15M, phoneDay: env.OTP_LIMIT_PHONE_DAY, ip15m: env.OTP_LIMIT_IP_15M, ipDay: env.OTP_LIMIT_IP_DAY },
  });
  if (result.ok) return null;
  return result.error === "RATE_LIMITED" ? t(RATE_LIMIT_MESSAGES[`${result.hit.scope}:${result.hit.window}`]) : t("errors.otpUnavailable");
}

/** Checks the code typed for `phone`. Returns an error message, or null when it is right. */
export async function checkCode(phone: string, code: string): Promise<string | null> {
  const result = await verifyOtp({ phone, code: code.trim(), now: new Date(), mode: getEnv().OTP_MODE });
  if (result.ok) return null;
  switch (result.error) {
    case "INVALID_FORMAT":
      return t("errors.invalidCode");
    case "WRONG_CODE":
      return t("errors.wrongCode", { attempts: result.attemptsLeft });
    case "TOO_MANY_ATTEMPTS":
      return t("errors.tooManyAttempts");
    default:
      return t("errors.codeExpired");
  }
}

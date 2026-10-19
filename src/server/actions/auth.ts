"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { MessageKey } from "@/i18n";
import { endSession, getCurrentUser, loginPath, startSession } from "@/lib/auth/current-user";
import { clientIpFrom, homePathFor, safeNextPath, type RateLimitHit } from "@/lib/auth/rules";
import { getEnv } from "@/lib/env";
import { setFlash } from "@/lib/flash";
import { normalizeIndianMobile } from "@/lib/phone";
import { findOrCreateUserByPhone, joinSchema, joinSociety, resolveDemoLogin } from "@/server/auth";
import { requestOtp, verifyOtp } from "@/server/otp";

export type FormError = { key: MessageKey; vars?: Record<string, string | number> };

export type LoginState = {
  step: "phone" | "code";
  /** Normalised phone once accepted. */
  phone?: string;
  /** What the person typed, so the field keeps it after an error. */
  phoneInput?: string;
  error?: FormError;
};

const RATE_LIMIT_MESSAGES: Record<`${RateLimitHit["scope"]}:${RateLimitHit["window"]}`, MessageKey> = {
  "phone:15m": "errors.rateLimitedPhone15m",
  "phone:day": "errors.rateLimitedPhoneDay",
  "ip:15m": "errors.rateLimitedIp15m",
  "ip:day": "errors.rateLimitedIpDay",
};

export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "");
  if (intent === "change") return { step: "phone", phoneInput: prev.phone?.slice(3) };

  const phoneInput = String(formData.get("phone") ?? "");
  const phone = normalizeIndianMobile(phoneInput);
  if (!phone) return { step: "phone", phoneInput, error: { key: "errors.invalidPhone" } };
  const env = getEnv();

  if (intent === "request") {
    const result = await requestOtp({
      phone,
      ip: clientIpFrom(await headers()),
      now: new Date(),
      mode: env.OTP_MODE,
      limits: {
        phone15m: env.OTP_LIMIT_PHONE_15M,
        phoneDay: env.OTP_LIMIT_PHONE_DAY,
        ip15m: env.OTP_LIMIT_IP_15M,
        ipDay: env.OTP_LIMIT_IP_DAY,
      },
    });
    if (result.ok) return { step: "code", phone };
    const error: FormError =
      result.error === "RATE_LIMITED"
        ? { key: RATE_LIMIT_MESSAGES[`${result.hit.scope}:${result.hit.window}`] }
        : { key: "errors.otpUnavailable" };
    // A failed resend keeps the person on the code screen; their earlier code may still work.
    return prev.step === "code" && prev.phone === phone ? { step: "code", phone, error } : { step: "phone", phoneInput, error };
  }

  if (intent === "verify") {
    const result = await verifyOtp({ phone, code: String(formData.get("code") ?? "").trim(), now: new Date(), mode: env.OTP_MODE });
    if (!result.ok) {
      const error: FormError =
        result.error === "INVALID_FORMAT"
          ? { key: "errors.invalidCode" }
          : result.error === "WRONG_CODE"
            ? { key: "errors.wrongCode", vars: { attempts: result.attemptsLeft } }
            : result.error === "TOO_MANY_ATTEMPTS"
              ? { key: "errors.tooManyAttempts" }
              : { key: "errors.codeExpired" };
      return { step: "code", phone, error };
    }
    const user = await findOrCreateUserByPhone(phone);
    await startSession(user.id);
    redirect(safeNextPath(String(formData.get("next") ?? "")) ?? homePathFor(user));
  }

  return { step: "phone", phoneInput, error: { key: "errors.generic" } };
}

export async function demoLoginAction(formData: FormData): Promise<void> {
  const result = await resolveDemoLogin(String(formData.get("key") ?? ""), getEnv().DEMO_MODE);
  if (!result.ok) redirect("/login?error=demo");
  await startSession(result.user.id);
  redirect(safeNextPath(String(formData.get("next") ?? "")) ?? homePathFor(result.user));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/** Sends someone who typed an invite code to that society's invite page. */
export async function goToInviteAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  redirect(code ? `/join/${code}` : "/join?error=code");
}

export type JoinState = { error?: FormError; name?: string };

const ROUND_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function joinAction(prev: JoinState, formData: FormData): Promise<JoinState> {
  const code = String(formData.get("code") ?? "");
  const round = String(formData.get("round") ?? "");
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(`/join/${encodeURIComponent(code)}`));

  const name = String(formData.get("name") ?? "");
  const parsed = joinSchema.safeParse({ name, flatId: formData.get("flatId") ?? "" });
  if (!parsed.success) {
    const nameProblem = parsed.error.issues.some((i) => i.path[0] === "name");
    return { name, error: { key: nameProblem ? "errors.invalidName" : "errors.chooseFlat" } };
  }

  const result = await joinSociety({ userId: user.id, societyCode: code, ...parsed.data });
  if (!result.ok) {
    const key: MessageKey = {
      UNKNOWN_SOCIETY: "errors.unknownSociety",
      UNKNOWN_FLAT: "errors.chooseFlat",
      ALREADY_MEMBER: "errors.alreadyMember",
      NOT_RESIDENT: "errors.notResident",
    }[result.error] as MessageKey;
    return { name, error: { key } };
  }
  await setFlash("success", "join.joined", { society: result.societyName });
  redirect(ROUND_ID.test(round) ? `/round/${round}` : "/");
}

"use server";

import { redirect } from "next/navigation";
import { t } from "@/i18n";
import { endSession, startSession } from "@/lib/auth/current-user";
import { homePathFor, safeNextPath } from "@/lib/auth/rules";
import { getEnv } from "@/lib/env";
import { normalizeIndianMobile } from "@/lib/phone";
import { findUserByPhone, resolveDemoLogin } from "@/server/auth";
import { checkCode, issueCode } from "@/server/otp-flow";

export type LoginState = {
  /** "noAccount": the code was right but nobody has registered this number. */
  step: "phone" | "code" | "noAccount";
  /** Normalised phone once accepted. */
  phone?: string;
  /** What the person typed, so the field keeps it after an error. */
  phoneInput?: string;
  /** Already translated. */
  error?: string;
};

export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = String(formData.get("intent") ?? "");
  if (intent === "change") return { step: "phone", phoneInput: prev.phone?.slice(3) };

  const phoneInput = String(formData.get("phone") ?? "");
  const phone = normalizeIndianMobile(phoneInput);
  if (!phone) return { step: "phone", phoneInput, error: t("errors.invalidPhone") };

  if (intent === "request") {
    const error = await issueCode(phone);
    if (!error) return { step: "code", phone };
    // A failed resend keeps the person on the code screen; their earlier code may still work.
    return prev.step === "code" && prev.phone === phone ? { step: "code", phone, error } : { step: "phone", phoneInput, error };
  }

  if (intent === "verify") {
    const error = await checkCode(phone, String(formData.get("code") ?? ""));
    if (error) return { step: "code", phone, error };
    // Logging in never creates an account. Someone new is offered registration instead.
    const user = await findUserByPhone(phone);
    if (!user) return { step: "noAccount", phone };
    await startSession(user.id);
    redirect(safeNextPath(String(formData.get("next") ?? "")) ?? homePathFor(user));
  }

  return { step: "phone", phoneInput, error: t("errors.generic") };
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

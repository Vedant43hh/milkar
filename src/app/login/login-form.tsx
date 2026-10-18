"use client";

import { useActionState } from "react";
import { Button, ErrorText, Input, Label, Notice } from "@/components/ui";
import { t } from "@/i18n";
import { maskPhone } from "@/lib/phone";
import { loginAction, type LoginState } from "@/server/actions/auth";

const initialState: LoginState = { step: "phone" };

export function LoginForm({ next, mockOtp }: { next: string | null; mockOtp: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {state.step === "phone" || !state.phone ? (
        <>
          <div>
            <Label htmlFor="phone">{t("auth.phoneLabel")}</Label>
            <div className="flex items-stretch gap-2">
              <span className="flex min-h-11 items-center rounded-lg border border-stone-300 bg-stone-100 px-3 text-stone-700">
                +91
              </span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={t("auth.phonePlaceholder")}
                defaultValue={state.phoneInput}
                required
                autoFocus
              />
            </div>
          </div>
          <Button name="intent" value="request" disabled={pending}>
            {t("auth.sendCode")}
          </Button>
        </>
      ) : (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <p className="text-sm text-stone-600">{t("auth.codeSentTo", { phone: maskPhone(state.phone) })}</p>
          <div>
            <Label htmlFor="code">{t("auth.codeLabel")}</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              className="tracking-[0.4em]"
              required
              autoFocus
            />
          </div>
          {mockOtp && <Notice>{t("auth.mockHint")}</Notice>}
          <Button name="intent" value="verify" disabled={pending}>
            {t("auth.verify")}
          </Button>
          <div className="flex justify-between">
            <Button variant="ghost" name="intent" value="request" formNoValidate disabled={pending}>
              {t("auth.resend")}
            </Button>
            <Button variant="ghost" name="intent" value="change" formNoValidate disabled={pending}>
              {t("auth.changeNumber")}
            </Button>
          </div>
        </>
      )}
      {state.error && <ErrorText>{t(state.error.key, state.error.vars)}</ErrorText>}
    </form>
  );
}

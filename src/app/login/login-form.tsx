"use client";

import { CircleAlert, FlaskConical } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/display";
import { Input, Label } from "@/components/ui/form";
import { t } from "@/i18n";
import { maskPhone } from "@/lib/phone";
import { loginAction, type LoginState } from "@/server/actions/auth";

const initialState: LoginState = { step: "phone" };

export function LoginForm({ next, mockOtp }: { next: string | null; mockOtp: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const error = state.error && (
    <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
      {t(state.error.key, state.error.vars)}
    </Banner>
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {state.step === "phone" || !state.phone ? (
        <>
          <div>
            <Label htmlFor="phone">{t("auth.phoneLabel")}</Label>
            <div className="flex items-stretch gap-2">
              <span className="flex min-h-11 items-center rounded-control border border-border-strong bg-surface-2 px-3 text-muted">+91</span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={t("auth.phonePlaceholder")}
                defaultValue={state.phoneInput}
                aria-invalid={state.error ? true : undefined}
                required
                autoFocus
              />
            </div>
          </div>
          {error}
          <Button name="intent" value="request" block loading={pending}>
            {t("auth.sendCode")}
          </Button>
        </>
      ) : (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <p className="text-sm text-muted">{t("auth.codeSentTo", { phone: maskPhone(state.phone) })}</p>
          <div>
            <Label htmlFor="code">{t("auth.codeLabel")}</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              className="text-center text-xl tracking-[0.5em]"
              aria-invalid={state.error ? true : undefined}
              required
              autoFocus
            />
          </div>
          {mockOtp && (
            <Banner tone="accent" icon={<FlaskConical aria-hidden className="size-4" />}>
              {t("auth.mockHint")}
            </Banner>
          )}
          {error}
          <Button name="intent" value="verify" block loading={pending}>
            {t("auth.verify")}
          </Button>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" name="intent" value="request" formNoValidate disabled={pending}>
              {t("auth.resend")}
            </Button>
            <Button variant="ghost" size="sm" name="intent" value="change" formNoValidate disabled={pending}>
              {t("auth.changeNumber")}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

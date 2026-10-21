"use client";

import { CircleAlert, FlaskConical, UserPlus } from "lucide-react";
import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/display";
import { Input, Label } from "@/components/ui/form";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { maskPhone } from "@/lib/phone";
import { loginAction, type LoginState } from "@/server/actions/auth";

const initialState: LoginState = { step: "phone" };

export function LoginForm({ next, mockOtp, text }: { next: string | null; mockOtp: boolean; text: Messages["auth"] }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const error = state.error && (
    <Banner tone="danger" role="alert" icon={<CircleAlert aria-hidden className="size-4" />}>
      {state.error}
    </Banner>
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {state.step === "noAccount" && state.phone ? (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <Banner tone="info" role="status" title={text.noAccountTitle} icon={<UserPlus aria-hidden className="size-4" />}>
            {text.noAccountBody}
          </Banner>
          <ButtonLink href="/register" block icon={<UserPlus aria-hidden className="size-4" />}>
            {text.registerInstead}
          </ButtonLink>
          <Button variant="ghost" block name="intent" value="change" formNoValidate>
            {text.tryAnotherNumber}
          </Button>
        </>
      ) : state.step === "phone" || !state.phone ? (
        <>
          <div>
            <Label htmlFor="phone">{text.phoneLabel}</Label>
            <div className="flex items-stretch gap-2">
              <span className="flex min-h-11 items-center rounded-control border border-border-strong bg-surface-2 px-3 text-muted">+91</span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={text.phonePlaceholder}
                defaultValue={state.phoneInput}
                aria-invalid={state.error ? true : undefined}
                required
                autoFocus
              />
            </div>
          </div>
          {error}
          <Button name="intent" value="request" block loading={pending}>
            {text.sendCode}
          </Button>
        </>
      ) : (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <p className="text-sm text-muted">{interpolate(text.codeSentTo, { phone: maskPhone(state.phone) })}</p>
          <div>
            <Label htmlFor="code">{text.codeLabel}</Label>
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
              {text.mockHint}
            </Banner>
          )}
          {error}
          <Button name="intent" value="verify" block loading={pending}>
            {text.verify}
          </Button>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" size="sm" name="intent" value="request" formNoValidate disabled={pending}>
              {text.resend}
            </Button>
            <Button variant="ghost" size="sm" name="intent" value="change" formNoValidate disabled={pending}>
              {text.changeNumber}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

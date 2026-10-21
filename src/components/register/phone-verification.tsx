"use client";

import { CircleAlert, FlaskConical, Send } from "lucide-react";
import { useState, useTransition } from "react";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { maskPhone } from "@/lib/phone";
import { sendRegistrationCodeAction } from "@/server/actions/register";
import { Button } from "../ui/button";
import { Input, Label } from "../ui/form";

/**
 * The wizard's last step: send a code to the phone, then type it. The form submits `phone` and
 * `code`; the server checks the code before creating anything. `onSent` lets the wizard enable
 * its submit button once a code is on its way.
 */
export function PhoneVerification({ text, mockOtp, onSent }: { text: Messages["register"]["phone"]; mockOtp: boolean; onSent: (sent: boolean) => void }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const result = await sendRegistrationCodeAction(sentTo ?? phoneInput);
      if (result.ok) {
        setSentTo(result.phone);
        setError(null);
        onSent(true);
      } else {
        setError(result.error);
      }
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{text.intro}</p>
      {sentTo ? (
        <>
          <input type="hidden" name="phone" value={sentTo} />
          <p className="text-sm font-medium text-fg">{interpolate(text.codeSent, { phone: maskPhone(sentTo) })}</p>
          <div>
            <Label htmlFor="register-code">{text.codeLabel}</Label>
            <Input
              id="register-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              className="text-center text-xl tracking-[0.5em]"
            />
          </div>
          {mockOtp && (
            <p className="flex items-center gap-1.5 text-sm text-accent-soft-fg">
              <FlaskConical aria-hidden className="size-4" />
              {text.mockHint}
            </p>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={send} loading={pending}>
            {text.resend}
          </Button>
        </>
      ) : (
        <div>
          <Label htmlFor="register-phone">{text.label}</Label>
          <div className="flex items-stretch gap-2">
            <span className="flex min-h-11 items-center rounded-control border border-border-strong bg-surface-2 px-3 text-muted">+91</span>
            <Input
              id="register-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
            />
          </div>
          <Button type="button" className="mt-3" onClick={send} loading={pending} disabled={phoneInput.replace(/\D/g, "").length < 10} icon={<Send aria-hidden className="size-4" />}>
            {text.sendCode}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useActionState, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { t } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "./button";
import { useToast } from "./toast";

/**
 * A form for a server action that stays on the page: the result's message shows as a toast, and
 * inside a sheet the sheet closes on success. Works without JavaScript too (the page just reloads).
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [, formAction] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.message) toast({ tone: result.ok ? "success" : "error", title: t(result.message, result.vars) });
    if (result.ok) form.current?.closest("dialog")?.close();
    return result;
  }, { ok: true });
  return (
    <form ref={form} action={formAction} className={className}>
      {children}
    </form>
  );
}

/** A submit button that shows a spinner while its form's action runs. */
export function SubmitButton(props: Omit<ComponentProps<typeof Button>, "type">) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" loading={pending || props.loading} />;
}

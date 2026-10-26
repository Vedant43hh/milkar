import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses, type ButtonVariant } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { ActionResult } from "@/lib/action-result";

/**
 * A button that opens a sheet explaining what will happen, with any extra fields, and a confirm
 * button that runs the action. The sheet closes when it succeeds; the result shows as a toast.
 */
export function ConfirmAction({
  action,
  fields,
  trigger,
  title,
  body,
  confirm,
  danger = false,
  triggerVariant = "secondary",
  children,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** Hidden inputs naming what's acted on. */
  fields: Record<string, string>;
  trigger: ReactNode;
  title: string;
  body?: ReactNode;
  confirm: string;
  danger?: boolean;
  triggerVariant?: ButtonVariant;
  children?: ReactNode;
}) {
  return (
    <Sheet title={title} trigger={trigger} triggerClassName={buttonClasses({ variant: triggerVariant, size: "sm" })}>
      <ActionForm action={action} className="space-y-4">
        {body && <div className="text-sm text-muted">{body}</div>}
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {children}
        <SubmitButton block variant={danger ? "danger" : "primary"}>
          {confirm}
        </SubmitButton>
      </ActionForm>
    </Sheet>
  );
}

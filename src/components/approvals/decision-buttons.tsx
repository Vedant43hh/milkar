import { Check, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClasses } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Sheet } from "@/components/ui/sheet";
import type { ActionResult } from "@/lib/action-result";

/**
 * Approve at once, or decline with an optional note the applicant will see. `field` is the hidden
 * input naming what is decided (a join request, a community, a vendor).
 */
export function DecisionButtons({
  action,
  field,
  labels,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  field: { name: string; value: string };
  labels: { approve: string; decline: string; declineTitle: string; noteLabel: string; notePlaceholder?: string; confirmDecline: string };
}) {
  const hidden = <input type="hidden" name={field.name} value={field.value} />;
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={action}>
        {hidden}
        <input type="hidden" name="decision" value="APPROVED" />
        <SubmitButton size="sm" icon={<Check aria-hidden className="size-4" />}>
          {labels.approve}
        </SubmitButton>
      </ActionForm>
      <Sheet
        title={labels.declineTitle}
        trigger={
          <>
            <X aria-hidden className="size-4" />
            {labels.decline}
          </>
        }
        triggerClassName={buttonClasses({ variant: "secondary", size: "sm" })}
      >
        <ActionForm action={action} className="space-y-4">
          {hidden}
          <input type="hidden" name="decision" value="REJECTED" />
          <Field id={`note-${field.value}`} label={labels.noteLabel}>
            {(aria) => <Textarea {...aria} name="note" rows={3} maxLength={300} placeholder={labels.notePlaceholder} />}
          </Field>
          <SubmitButton variant="danger" block>
            {labels.confirmDecline}
          </SubmitButton>
        </ActionForm>
      </Sheet>
    </div>
  );
}

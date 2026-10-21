"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormErrors } from "@/components/ui/form-errors";
import type { Messages } from "@/i18n";
import { createPollAction, type FormState } from "@/server/actions/manager";

export type PollTargets = {
  services: { id: string; label: string }[];
  products: { id: string; label: string }[];
};

export function PollForm({ targets, defaultTarget, text }: { targets: PollTargets; defaultTarget?: string; text: Messages["manager"] }) {
  const [state, formAction, pending] = useActionState(createPollAction, {} as FormState);
  const values = state.values;

  return (
    <form action={formAction} className="space-y-5">
      <FormErrors errors={state.errors} />
      <Card className="space-y-4">
        <Field id="target" label={text.polls.form.target}>
          {(aria) => (
            <Select {...aria} name="target" defaultValue={values?.target ?? defaultTarget ?? "other"}>
              <optgroup label={text.polls.form.services}>
                {targets.services.map((s) => (
                  <option key={s.id} value={`service:${s.id}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label={text.polls.form.groceries}>
                {targets.products.map((p) => (
                  <option key={p.id} value={`product:${p.id}`}>
                    {p.label}
                  </option>
                ))}
                <option value="other">{text.polls.form.other}</option>
              </optgroup>
            </Select>
          )}
        </Field>
        <Field id="title" label={text.polls.form.title}>
          {(aria) => <Input {...aria} name="title" required minLength={3} maxLength={80} placeholder={text.polls.form.titlePlaceholder} defaultValue={values?.title} />}
        </Field>
        <Field id="description" label={`${text.polls.form.description} (${text.form.optional})`}>
          {(aria) => <Textarea {...aria} name="description" maxLength={300} defaultValue={values?.description} />}
        </Field>
        <Field id="threshold" label={text.polls.thresholdLabel} hint={text.polls.thresholdHint}>
          {(aria) => <Input {...aria} type="number" name="threshold" min={2} max={500} inputMode="numeric" className="max-w-32" defaultValue={values?.threshold} />}
        </Field>
      </Card>
      <Button block loading={pending}>
        {text.polls.form.submit}
      </Button>
    </form>
  );
}

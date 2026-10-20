"use client";

import { useActionState } from "react";
import type { Messages } from "@/i18n";
import { suggestPollAction, type SuggestState } from "@/server/actions/polls";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Field, Input, Select, Textarea } from "../ui/form";
import { FormErrors } from "../ui/form-errors";

export function SuggestForm({ services, text }: { services: { id: string; label: string }[]; text: Messages["polls"]["form"] }) {
  const [state, formAction, pending] = useActionState(suggestPollAction, {} as SuggestState);
  const values = state.values;
  return (
    <form action={formAction} className="space-y-5">
      <FormErrors errors={state.errors} />
      <Card className="space-y-4">
        <Field id="title" label={text.title}>
          {(aria) => <Input {...aria} name="title" required minLength={3} maxLength={80} placeholder={text.titlePlaceholder} defaultValue={values?.title} />}
        </Field>
        <Field id="target" label={text.target}>
          {(aria) => (
            <Select {...aria} name="target" defaultValue={values?.target ?? "other"}>
              <option value="other">{text.other}</option>
              <optgroup label={text.services}>
                {services.map((s) => (
                  <option key={s.id} value={`service:${s.id}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </Select>
          )}
        </Field>
        <Field id="description" label={`${text.description} (${text.optional})`}>
          {(aria) => <Textarea {...aria} name="description" maxLength={300} defaultValue={values?.description} />}
        </Field>
      </Card>
      <Button block loading={pending}>
        {text.submit}
      </Button>
    </form>
  );
}

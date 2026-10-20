"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormErrors } from "@/components/ui/form-errors";
import { t } from "@/i18n";
import { createPollAction, type FormState } from "@/server/actions/captain";

export type PollTargets = {
  services: { id: string; label: string }[];
  products: { id: string; label: string }[];
};

export function PollForm({ targets, defaultTarget }: { targets: PollTargets; defaultTarget?: string }) {
  const [state, formAction, pending] = useActionState(createPollAction, {} as FormState);
  const values = state.values;

  return (
    <form action={formAction} className="space-y-5">
      <FormErrors errors={state.errors} />
      <Card className="space-y-4">
        <Field id="target" label={t("captain.polls.form.target")}>
          {(aria) => (
            <Select {...aria} name="target" defaultValue={values?.target ?? defaultTarget ?? "other"}>
              <optgroup label={t("captain.polls.form.services")}>
                {targets.services.map((s) => (
                  <option key={s.id} value={`service:${s.id}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("captain.polls.form.groceries")}>
                {targets.products.map((p) => (
                  <option key={p.id} value={`product:${p.id}`}>
                    {p.label}
                  </option>
                ))}
                <option value="other">{t("captain.polls.form.other")}</option>
              </optgroup>
            </Select>
          )}
        </Field>
        <Field id="title" label={t("captain.polls.form.title")}>
          {(aria) => <Input {...aria} name="title" required minLength={3} maxLength={80} placeholder={t("captain.polls.form.titlePlaceholder")} defaultValue={values?.title} />}
        </Field>
        <Field id="description" label={`${t("captain.polls.form.description")} (${t("captain.form.optional")})`}>
          {(aria) => <Textarea {...aria} name="description" maxLength={300} defaultValue={values?.description} />}
        </Field>
        <Field id="threshold" label={t("captain.polls.thresholdLabel")} hint={t("captain.polls.thresholdHint")}>
          {(aria) => <Input {...aria} type="number" name="threshold" min={2} max={500} inputMode="numeric" className="max-w-32" defaultValue={values?.threshold} />}
        </Field>
      </Card>
      <Button block loading={pending}>
        {t("captain.polls.form.submit")}
      </Button>
    </form>
  );
}

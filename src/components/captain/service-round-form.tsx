"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Switch } from "@/components/ui/form";
import { FormErrors } from "@/components/ui/form-errors";
import { t } from "@/i18n";
import { createServiceRoundAction, type FormState } from "@/server/actions/captain";

export type ServiceRoundDefaults = { title: string; cutoffAt: string; day1: string; repeatWeekly: boolean };

export function ServiceRoundForm({ serviceId, defaults }: { serviceId: string; defaults: ServiceRoundDefaults }) {
  const [state, formAction, pending] = useActionState(createServiceRoundAction, {} as FormState);
  const values = state.values;

  return (
    <form action={formAction} className="space-y-5">
      <FormErrors errors={state.errors} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <Card className="space-y-4">
        <Field id="title" label={t("captain.form.title")}>
          {(aria) => <Input {...aria} name="title" required minLength={3} maxLength={80} defaultValue={values?.title ?? defaults.title} />}
        </Field>
        <Field id="cutoffAt" label={t("captain.form.cutoff")} hint={t("captain.form.cutoffHint")}>
          {(aria) => <Input {...aria} type="datetime-local" name="cutoffAt" required defaultValue={values?.cutoffAt ?? defaults.cutoffAt} />}
        </Field>
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">{t("captain.form.serviceDays")}</legend>
          <p className="text-sm text-muted">{t("captain.form.serviceDaysHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Field key={n} id={`day${n}`} label={n === 1 ? t("captain.form.serviceDayN", { n }) : `${t("captain.form.serviceDayN", { n })} (${t("captain.form.optional")})`}>
                {(aria) => <Input {...aria} type="date" name={`day${n}`} required={n === 1} defaultValue={values?.[`day${n}`] ?? (n === 1 ? defaults.day1 : "")} />}
              </Field>
            ))}
          </div>
        </fieldset>
        <div>
          <Switch name="repeatWeekly" label={t("captain.form.repeatWeekly")} defaultChecked={values ? values.repeatWeekly === "on" : defaults.repeatWeekly} />
          <p className="text-sm text-muted">{t("captain.form.repeatWeeklyHint")}</p>
        </div>
      </Card>
      <Button block loading={pending}>
        {t("captain.form.submitService")}
      </Button>
    </form>
  );
}

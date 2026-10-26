"use client";

import { CalendarCheck, Clock, Repeat } from "lucide-react";
import { useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/form";
import { FormErrors } from "@/components/ui/form-errors";
import { Wizard } from "@/components/ui/wizard";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { showFieldDate } from "@/lib/field-dates";
import { createServiceRoundAction, type FormState } from "@/server/actions/manager";

export type ServiceRoundDefaults = { title: string; cutoffAt: string; day1: string; repeatWeekly: boolean };


/** Opening a Service Day, Repair Day or subscription in three steps: name and closing time, days, then a check. */
export function ServiceRoundForm({ serviceId, defaults, text }: { serviceId: string; defaults: ServiceRoundDefaults; text: Messages["manager"] }) {
  const [state, formAction, pending] = useActionState(createServiceRoundAction, {} as FormState);
  const values = state.values;
  const [live, setLive] = useState<Record<string, string>>({ cutoffAt: defaults.cutoffAt, day1: defaults.day1, repeatWeekly: defaults.repeatWeekly ? "on" : "" });
  const onChange = (e: FormEvent<HTMLFormElement>) => setLive(Object.fromEntries([...new FormData(e.currentTarget).entries()].map(([k, v]) => [k, String(v)])));
  const days = [live.day1, live.day2, live.day3].filter(Boolean).map((d) => showFieldDate(d, text.form.notSet));
  const f = text.form;

  return (
    <form action={formAction} onChange={onChange} className="space-y-5">
      <FormErrors errors={state.errors} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <Wizard
        steps={[
          {
            id: "details",
            title: f.stepDetails,
            content: (
              <>
                <Field id="title" label={f.title}>
                  {(aria) => <Input {...aria} name="title" required minLength={3} maxLength={80} defaultValue={values?.title ?? defaults.title} />}
                </Field>
                <Field id="cutoffAt" label={f.cutoff} hint={f.cutoffHint}>
                  {(aria) => <Input {...aria} type="datetime-local" name="cutoffAt" required defaultValue={values?.cutoffAt ?? defaults.cutoffAt} />}
                </Field>
              </>
            ),
          },
          {
            id: "days",
            title: f.stepDays,
            content: (
              <>
                <p className="text-sm text-muted">{f.serviceDaysHint}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[1, 2, 3].map((n) => (
                    <Field key={n} id={`day${n}`} label={n === 1 ? interpolate(f.serviceDayN, { n }) : `${interpolate(f.serviceDayN, { n })} (${f.optional})`}>
                      {(aria) => <Input {...aria} type="date" name={`day${n}`} required={n === 1} defaultValue={values?.[`day${n}`] ?? (n === 1 ? defaults.day1 : "")} />}
                    </Field>
                  ))}
                </div>
                <div>
                  <Switch name="repeatWeekly" label={f.repeatWeekly} defaultChecked={values ? values.repeatWeekly === "on" : defaults.repeatWeekly} />
                  <p className="text-sm text-muted">{f.repeatWeeklyHint}</p>
                </div>
              </>
            ),
          },
          {
            id: "check",
            title: f.stepCheck,
            content: (
              <div className="space-y-3 rounded-card border border-border bg-surface p-4 text-sm">
                <p className="text-muted">{f.checkIntro}</p>
                <ul className="space-y-1.5 text-fg">
                  <li className="flex items-center gap-2">
                    <Clock aria-hidden className="size-4 text-muted" />
                    {interpolate(f.checkCutoff, { when: showFieldDate(live.cutoffAt ?? "", f.notSet) })}
                  </li>
                  <li className="flex items-center gap-2">
                    <CalendarCheck aria-hidden className="size-4 text-muted" />
                    {interpolate(f.checkDays, { days: days.join(", ") || f.notSet })}
                  </li>
                  {live.repeatWeekly === "on" && (
                    <li className="flex items-center gap-2">
                      <Repeat aria-hidden className="size-4 text-muted" />
                      {f.checkWeekly}
                    </li>
                  )}
                </ul>
                <p className="text-muted">{f.checkShare}</p>
              </div>
            ),
          },
        ]}
        submit={
          <Button loading={pending}>
            {f.submitService}
          </Button>
        }
      />
    </form>
  );
}

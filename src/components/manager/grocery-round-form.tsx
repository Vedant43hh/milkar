"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Switch } from "@/components/ui/form";
import { FormErrors } from "@/components/ui/form-errors";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { createGroceryRoundAction, type FormState } from "@/server/actions/manager";

export type ProductChoice = {
  id: string;
  name: string;
  /** "From Shree Balaji · Starts at 10" */
  detail: string;
  /** "₹500 → ₹465 at 20+ → ₹440 at 50+" */
  ladder: string;
  defaultCap: number;
};

export type ProductGroup = { label: string; products: ProductChoice[] };

export function GroceryRoundForm({
  groups,
  defaults,
  text,
}: {
  groups: ProductGroup[];
  defaults: { title: string; cutoffAt: string; deliveryAt: string };
  text: Messages["manager"];
}) {
  const [state, formAction, pending] = useActionState(createGroceryRoundAction, {} as FormState);
  const values = state.values;
  const checked = state.checked ? new Set(state.checked) : null;

  return (
    <form action={formAction} className="space-y-5">
      <FormErrors errors={state.errors} />
      <Card className="space-y-4">
        <Field id="title" label={text.form.title}>
          {(aria) => <Input {...aria} name="title" required minLength={3} maxLength={80} placeholder={text.form.groceryTitlePlaceholder} defaultValue={values?.title ?? defaults.title} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cutoffAt" label={text.form.cutoff} hint={text.form.cutoffHint}>
            {(aria) => <Input {...aria} type="datetime-local" name="cutoffAt" required defaultValue={values?.cutoffAt ?? defaults.cutoffAt} />}
          </Field>
          <Field id="deliveryAt" label={text.form.delivery} hint={text.form.deliveryHint}>
            {(aria) => <Input {...aria} type="datetime-local" name="deliveryAt" required defaultValue={values?.deliveryAt ?? defaults.deliveryAt} />}
          </Field>
        </div>
        <Switch name="requirePickupCode" label={text.form.pickupCode} defaultChecked={values ? values.requirePickupCode === "on" : true} />
      </Card>

      <section aria-labelledby="products-heading" className="space-y-3">
        <div>
          <h2 id="products-heading" className="text-base font-semibold">
            {text.form.products}
          </h2>
          <p className="text-sm text-muted">{text.form.productsHint}</p>
        </div>
        {groups.map((group) => (
          <fieldset key={group.label} className="rounded-card border border-border bg-surface">
            <legend className="sr-only">{group.label}</legend>
            <p aria-hidden className="border-b border-border px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {group.label}
            </p>
            <ul className="divide-y divide-border">
              {group.products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    name="product"
                    value={p.id}
                    id={`product-${p.id}`}
                    defaultChecked={checked ? checked.has(p.id) : true}
                    className="size-5 shrink-0 accent-brand"
                  />
                  <label htmlFor={`product-${p.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block font-medium text-fg">{p.name}</span>
                    <span className="block text-xs text-muted tabular-nums">{p.ladder}</span>
                    <span className="block text-xs text-subtle">{p.detail}</span>
                  </label>
                  <span className="flex shrink-0 flex-col items-center">
                    <Input
                      type="number"
                      name={`cap:${p.id}`}
                      min={1}
                      max={50}
                      inputMode="numeric"
                      defaultValue={values?.[`cap:${p.id}`] ?? p.defaultCap}
                      aria-label={interpolate(text.form.capFor, { product: p.name })}
                      className="w-16 px-2 text-center"
                    />
                    <span aria-hidden className="mt-0.5 text-[0.65rem] text-subtle">
                      {text.form.perFlat}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </section>

      <Button block loading={pending}>
        {text.form.submitGrocery}
      </Button>
    </form>
  );
}

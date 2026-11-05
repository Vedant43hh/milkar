"use client";

import { Save } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { FormErrors } from "@/components/ui/form-errors";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { formatBps } from "@/lib/pricing/money";
import type { TierRowInput } from "@/lib/vendor/tier-editor";
import { saveOptionAction, saveProductAction, saveServiceAction, type CatalogueFormState } from "@/server/actions/vendor";
import { TierEditor, type TierEditorText } from "./tier-editor";

type Text = Messages["catalogue"];
export type Choice = { value: string; label: string };

function tierText(text: Text, kind: "packs" | "flats", unit: string): TierEditorText {
  return {
    title: text.tiers.title,
    intro: kind === "packs" ? text.tiers.productIntro : interpolate(text.tiers.optionIntro, { unit }),
    from: kind === "packs" ? text.tiers.from : text.tiers.fromFlats,
    price: text.tiers.price,
    rowLabel: text.tiers.rowLabel,
    residentsPay: text.tiers.residentsPay,
    residentsPayHint: text.tiers.residentsPayHint,
  };
}

/** Saved rows, or what was typed if the form came back with errors. */
function rowsFrom(values: Record<string, string> | undefined, saved: TierRowInput[]): TierRowInput[] {
  if (!values) return saved;
  return saved.map((_, i) => ({ from: values[`tierFrom${i}`] ?? "", price: values[`tierPrice${i}`] ?? "" }));
}

function GstSelect({ id, value, onChange, rates, label }: { id: string; value: string; onChange: (v: string) => void; rates: readonly number[]; label: string }) {
  return (
    <Field id={id} label={label}>
      {(aria) => (
        <Select {...aria} name="gstBps" value={value} onChange={(e) => onChange(e.currentTarget.value)}>
          {rates.map((bps) => (
            <option key={bps} value={String(bps)}>
              {formatBps(bps)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export type ProductValues = {
  productId: string;
  name: string;
  category: string;
  unit: string;
  packSize: string;
  mrp: string;
  gstBps: string;
  minOrderQty: string;
  maxPerFlat: string;
  tiers: TierRowInput[];
};

export function ProductForm({
  initial,
  categories,
  units,
  gstRates,
  marginBps,
  text,
}: {
  initial: ProductValues;
  categories: Choice[];
  units: Choice[];
  gstRates: readonly number[];
  marginBps: number;
  text: Text;
}) {
  const [state, formAction, pending] = useActionState(saveProductAction, {} as CatalogueFormState);
  const v = { ...initial, ...state.values };
  const [gst, setGst] = useState(v.gstBps);
  const f = text.fields;
  return (
    <form action={formAction} className="space-y-4">
      <FormErrors errors={state.errors} />
      <input type="hidden" name="productId" value={initial.productId} />
      <Field id="name" label={f.name}>
        {(aria) => <Input {...aria} name="name" required minLength={2} maxLength={80} defaultValue={v.name} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="category" label={f.category}>
          {(aria) => (
            <Select {...aria} name="category" required defaultValue={v.category}>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="unit" label={f.unit}>
          {(aria) => (
            <Select {...aria} name="unit" required defaultValue={v.unit}>
              {units.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="packSize" label={f.packSize} hint={f.packSizeHint}>
          {(aria) => <Input {...aria} name="packSize" inputMode="numeric" required defaultValue={v.packSize} />}
        </Field>
        <Field id="mrp" label={f.mrp} hint={f.mrpHint}>
          {(aria) => <Input {...aria} name="mrp" inputMode="decimal" required defaultValue={v.mrp} />}
        </Field>
        <GstSelect id="gstBps" value={gst} onChange={setGst} rates={gstRates} label={f.gst} />
        <Field id="minOrderQty" label={f.minOrder} hint={f.minOrderHint}>
          {(aria) => <Input {...aria} name="minOrderQty" inputMode="numeric" required defaultValue={v.minOrderQty} />}
        </Field>
        <Field id="maxPerFlat" label={f.maxPerFlat}>
          {(aria) => <Input {...aria} name="maxPerFlat" inputMode="numeric" required defaultValue={v.maxPerFlat} />}
        </Field>
      </div>
      <TierEditor rows={rowsFrom(state.values, initial.tiers)} marginBps={marginBps} gstBps={Number(gst)} text={tierText(text, "packs", "")} />
      <Button loading={pending} icon={<Save aria-hidden className="size-4" />}>
        {text.save}
      </Button>
    </form>
  );
}

export type ServiceValues = {
  serviceId: string;
  name: string;
  category: string;
  description: string;
  minFlats: string;
  fee: string;
  durationMinutes: string;
  gstBps: string;
  weeklyByDefault: boolean;
};

export function ServiceForm({ initial, categories, gstRates, text }: { initial: ServiceValues; categories: Choice[]; gstRates: readonly number[]; text: Text }) {
  const [state, formAction, pending] = useActionState(saveServiceAction, {} as CatalogueFormState);
  const v = state.values ? { ...initial, ...state.values, weeklyByDefault: state.values.weeklyByDefault === "on" } : initial;
  const [gst, setGst] = useState(v.gstBps);
  const f = text.fields;
  return (
    <form action={formAction} className="space-y-4">
      <FormErrors errors={state.errors} />
      <input type="hidden" name="serviceId" value={initial.serviceId} />
      <Field id="name" label={f.name}>
        {(aria) => <Input {...aria} name="name" required minLength={2} maxLength={80} defaultValue={v.name} />}
      </Field>
      <Field id="category" label={f.category}>
        {(aria) => (
          <Select {...aria} name="category" required defaultValue={v.category}>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="description" label={f.description}>
        {(aria) => <Textarea {...aria} name="description" required minLength={10} maxLength={400} defaultValue={v.description} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="minFlats" label={f.minFlats} hint={f.minFlatsHint}>
          {(aria) => <Input {...aria} name="minFlats" inputMode="numeric" required defaultValue={v.minFlats} />}
        </Field>
        <Field id="fee" label={f.fee} hint={f.feeHint}>
          {(aria) => <Input {...aria} name="fee" inputMode="decimal" required defaultValue={v.fee} />}
        </Field>
        <Field id="durationMinutes" label={f.duration}>
          {(aria) => <Input {...aria} name="durationMinutes" inputMode="numeric" required defaultValue={v.durationMinutes} />}
        </Field>
        <GstSelect id="gstBps" value={gst} onChange={setGst} rates={gstRates} label={f.gst} />
      </div>
      <div>
        <Switch name="weeklyByDefault" label={f.weekly} defaultChecked={v.weeklyByDefault} />
        <p className="text-sm text-muted">{f.weeklyHint}</p>
      </div>
      <Button loading={pending} icon={<Save aria-hidden className="size-4" />}>
        {text.save}
      </Button>
    </form>
  );
}

export type OptionValues = {
  serviceId: string;
  optionId: string;
  name: string;
  unitLabel: string;
  mrp: string;
  maxPerFlat: string;
  tiers: TierRowInput[];
};

export function OptionForm({ initial, marginBps, gstBps, text }: { initial: OptionValues; marginBps: number; gstBps: number; text: Text }) {
  const [state, formAction, pending] = useActionState(saveOptionAction, {} as CatalogueFormState);
  const v = { ...initial, ...state.values };
  const [unit, setUnit] = useState(v.unitLabel);
  const f = text.fields;
  return (
    <form action={formAction} className="space-y-4">
      <FormErrors errors={state.errors} />
      <input type="hidden" name="serviceId" value={initial.serviceId} />
      <input type="hidden" name="optionId" value={initial.optionId} />
      <Field id="name" label={f.name}>
        {(aria) => <Input {...aria} name="name" required minLength={2} maxLength={60} defaultValue={v.name} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="unitLabel" label={f.unitLabel} hint={f.unitLabelHint}>
          {(aria) => <Input {...aria} name="unitLabel" required maxLength={20} defaultValue={v.unitLabel} onChange={(e) => setUnit(e.currentTarget.value)} />}
        </Field>
        <Field id="mrp" label={f.usualPrice} hint={f.usualPriceHint}>
          {(aria) => <Input {...aria} name="mrp" inputMode="decimal" required defaultValue={v.mrp} />}
        </Field>
        <Field id="maxPerFlat" label={f.maxPerFlatOption}>
          {(aria) => <Input {...aria} name="maxPerFlat" inputMode="numeric" required defaultValue={v.maxPerFlat} />}
        </Field>
      </div>
      <TierEditor rows={rowsFrom(state.values, initial.tiers)} marginBps={marginBps} gstBps={gstBps} text={tierText(text, "flats", unit.trim() || "unit")} />
      <Button loading={pending} icon={<Save aria-hidden className="size-4" />}>
        {text.save}
      </Button>
    </form>
  );
}

"use client";

import { Plus, Send, X } from "lucide-react";
import { useState } from "react";
import { interpolate } from "@/i18n/interpolate";
import { formatINR } from "@/lib/pricing/money";
import { requestPartsAction } from "@/server/actions/tech";
import { ActionForm, SubmitButton } from "../ui/action-form";
import { Button, IconButton } from "../ui/button";
import { Input, Label } from "../ui/form";

export type PartsFormText = { intro: string; name: string; namePlaceholder: string; qty: string; price: string; addRow: string; removeRow: string; total: string; send: string };

type Row = { key: number; qty: string; price: string };

/** Parts the job needs, one row each: name, how many, price each. The server checks everything again. */
export function PartsForm({ visitId, text }: { visitId: string; text: PartsFormText }) {
  const [rows, setRows] = useState<Row[]>([{ key: 0, qty: "1", price: "" }]);
  const [next, setNext] = useState(1);
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0) * Math.round((Number(r.price) || 0) * 100), 0);
  const update = (key: number, change: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));

  return (
    <ActionForm action={requestPartsAction} className="space-y-4">
      <p className="text-sm text-muted">{text.intro}</p>
      <input type="hidden" name="visitId" value={visitId} />
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li key={row.key} className="space-y-2 rounded-control border border-border p-3">
            <div>
              <Label htmlFor={`part-name-${row.key}`}>{text.name}</Label>
              <Input id={`part-name-${row.key}`} name="name" required minLength={2} maxLength={60} placeholder={text.namePlaceholder} autoComplete="off" />
            </div>
            <div className="grid grid-cols-[5rem_1fr_auto] items-end gap-2">
              <div>
                <Label htmlFor={`part-qty-${row.key}`}>{text.qty}</Label>
                <Input id={`part-qty-${row.key}`} name="qty" type="number" inputMode="numeric" required min={1} max={20} value={row.qty} onChange={(e) => update(row.key, { qty: e.target.value })} />
              </div>
              <div>
                <Label htmlFor={`part-price-${row.key}`}>{text.price}</Label>
                <Input id={`part-price-${row.key}`} name="price" type="number" inputMode="decimal" required min={1} max={50000} step="0.01" value={row.price} onChange={(e) => update(row.key, { price: e.target.value })} />
              </div>
              {rows.length > 1 ? (
                <IconButton label={`${text.removeRow} ${i + 1}`} onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                  <X aria-hidden className="size-4" />
                </IconButton>
              ) : (
                <span />
              )}
            </div>
          </li>
        ))}
      </ol>
      {rows.length < 10 && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus aria-hidden className="size-4" />}
          onClick={() => {
            setRows((all) => [...all, { key: next, qty: "1", price: "" }]);
            setNext(next + 1);
          }}
        >
          {text.addRow}
        </Button>
      )}
      <p className="text-base font-semibold text-fg tabular-nums" aria-live="polite">
        {interpolate(text.total, { total: formatINR(total) })}
      </p>
      <SubmitButton block size="lg" icon={<Send aria-hidden className="size-5" />}>
        {text.send}
      </SubmitButton>
    </ActionForm>
  );
}

"use client";

import { CalendarCheck, CalendarClock, ShoppingCart } from "lucide-react";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { computeMeter } from "@/lib/pricing/meter";
import { formatINR } from "@/lib/pricing/money";
import { unitPriceAt } from "@/lib/pricing/price";
import { changeSlotAction, setWeeklyAction } from "@/server/actions/services";
import type { ServiceDay, ServiceOptionRow } from "@/server/service-days";
import { useCheckout } from "../shop/checkout-flow";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { cn } from "../ui/cn";
import { Banner, Price } from "../ui/display";
import { Switch } from "../ui/form";
import { TierMeter } from "../ui/progress";
import { QuantityStepper } from "../ui/stepper";
import { useToast } from "../ui/toast";

type Text = Messages["serviceDay"];

const sum = (values: Record<string, number>) => Object.values(values).reduce((n, v) => n + v, 0);

/**
 * Booking a Service Day: units per option, then a time slot. Prices are per unit, set by how many
 * flats book in total; the meter previews your flat joining. The server prices the review and
 * takes the seat when the booking is paid.
 */
export function ServiceBooking({ day, text, shopText }: { day: ServiceDay; text: Text; shopText: Messages["shop"] }) {
  const { round, options, booking } = day;
  const toast = useToast();
  const initial = useMemo(() => Object.fromEntries(options.map((o) => [o.id, o.myQty])), [options]);
  // A held weekly slot starts from last week's order.
  const start = useMemo(() => (day.prefill && Object.keys(day.prefill).length > 0 ? { ...initial, ...day.prefill } : initial), [initial, day.prefill]);
  const [targets, setTargets] = useState<Record<string, number>>(start);
  const [base, setBase] = useState(start);
  if (base !== start) {
    setBase(start);
    setTargets(start);
  }
  const [held, setHeld] = useOptimistic(initial);
  const [slotId, setSlotId] = useState<string | null>(booking?.slotId ?? null);
  const [bookedSlot, setBookedSlot] = useOptimistic(booking?.slotId ?? null);
  const [changingSlot, setChangingSlot] = useState(false);
  const [weekly, setWeekly] = useState({ keep: booking?.keepSlotWeekly ?? round.repeatWeekly, auto: booking?.autoPayFromWallet ?? false });
  const [, startTransition] = useTransition();
  const checkout = useCheckout({ roundId: round.id, text: shopText, walletPaise: day.walletPaise, onPaid: () => setHeld(targets) });

  const changed = options.filter((o) => targets[o.id] !== held[o.id]);
  const changes = Object.fromEntries(changed.map((o) => [o.id, targets[o.id]]));
  const flatHasUnits = day.flatOthersUnits + sum(held) > 0;
  const flatWillHaveUnits = day.flatOthersUnits + sum(targets) > 0;
  const flats = day.basisCount + Number(flatWillHaveUnits) - Number(flatHasUnits);
  const needsSlot = !booking && flatWillHaveUnits;
  const first = options[0];
  const pricing = (o: ServiceOptionRow) => ({ tierBasis: "FLATS" as const, tiers: o.tiers, marginBps: round.marginBps, gstBps: o.gstBps, minOrderQty: o.minOrderQty, mrpPaise: o.mrpPaise });
  const slotLabel = (id: string | null) => day.slots.find((s) => s.id === id)?.label ?? "";
  const days = [...new Map(day.slots.map((s) => [s.day, day.slots.filter((x) => x.day === s.day)])).entries()];

  function moveTo(id: string) {
    setChangingSlot(false);
    startTransition(async () => {
      setBookedSlot(id);
      const result = await changeSlotAction(round.id, id, slotLabel(id));
      toast({ tone: result.ok ? "success" : "error", title: result.message });
    });
  }

  function saveWeekly(next: { keep: boolean; auto: boolean }) {
    setWeekly(next);
    if (!booking) return;
    startTransition(async () => {
      const result = await setWeeklyAction(round.id, next.keep, next.keep && next.auto);
      toast({ tone: result.ok ? "success" : "error", title: result.message });
    });
  }

  return (
    <div className="space-y-4">
      {booking?.status === "HELD" && booking.holdUntil && (
        <Banner tone="accent" icon={<CalendarClock aria-hidden className="size-4" />} title={interpolate(text.held, { until: booking.holdUntil })}>
          {text.heldBody}
        </Banner>
      )}

      {first && (
        <Card>
          <TierMeter meter={computeMeter(pricing(first), flats)} basisWords={day.flatWords} />
        </Card>
      )}

      <section aria-labelledby="options-heading" className="space-y-3">
        <h2 id="options-heading" className="text-base font-semibold text-fg">
          {text.options}
        </h2>
        <ul className="space-y-3">
          {options.map((o) => {
            const price = unitPriceAt(pricing(o), day.basisCount).totalPaise;
            const max = round.canAdd ? Math.max(o.maxQtyPerFlat - o.flatOthersQty, held[o.id]) : held[o.id];
            return (
              <li key={o.id} className={cn("rounded-card border bg-surface p-3 shadow-card", targets[o.id] !== held[o.id] ? "border-brand" : "border-border")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{o.name}</p>
                    <p className="text-xs text-muted">{interpolate(text.limit, { n: o.maxQtyPerFlat })}</p>
                    <div className="mt-1">
                      <Price paise={price} mrpPaise={o.mrpPaise} suffix={interpolate(text.perUnit, { unit: o.unitLabel })} />
                    </div>
                  </div>
                  <QuantityStepper
                    value={targets[o.id]}
                    onChange={(qty) => setTargets((t) => ({ ...t, [o.id]: qty }))}
                    label={o.name}
                    min={round.canReduce ? 0 : held[o.id]}
                    max={max}
                    decreaseDisabled={!round.canReduce && targets[o.id] <= held[o.id]}
                  />
                </div>
                {(held[o.id] > 0 || o.flatOthersQty > 0) && (
                  <p className="mt-2 text-xs text-muted">
                    {held[o.id] > 0 && interpolate(text.inYourOrder, { qty: held[o.id], paid: formatINR(o.myPaidPaise) })}
                    {held[o.id] > 0 && o.flatOthersQty > 0 && " · "}
                    {o.flatOthersQty > 0 && interpolate(text.household, { qty: o.flatOthersQty })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="slots-heading" className="space-y-3">
        <h2 id="slots-heading" className="text-base font-semibold text-fg">
          {booking ? text.yourSlot : text.slots}
        </h2>
        {booking && !changingSlot ? (
          <Card className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
              <CalendarCheck aria-hidden className="size-5 shrink-0 text-brand" />
              {slotLabel(bookedSlot)}
            </span>
            {booking.status === "ACTIVE" && round.canAdd && (
              <Button type="button" size="sm" variant="secondary" onClick={() => setChangingSlot(true)}>
                {text.changeSlot}
              </Button>
            )}
          </Card>
        ) : (
          <SlotPicker
            days={days}
            selected={booking ? bookedSlot : slotId}
            current={booking ? bookedSlot : null}
            text={text}
            onPick={(id) => (booking ? moveTo(id) : setSlotId(id))}
            onKeep={booking ? () => setChangingSlot(false) : undefined}
          />
        )}
      </section>

      {round.repeatWeekly && (
        <Card className="space-y-1">
          <h2 className="text-base font-semibold text-fg">{text.weekly}</h2>
          <Switch label={text.keepWeekly} checked={weekly.keep} onChange={(e) => saveWeekly({ ...weekly, keep: e.target.checked })} />
          <Switch label={text.autoPay} checked={weekly.keep && weekly.auto} disabled={!weekly.keep} onChange={(e) => saveWeekly({ ...weekly, auto: e.target.checked })} />
          <p className="text-xs text-muted">{text.autoPayHint}</p>
        </Card>
      )}

      {changed.length > 0 && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 space-y-1 rounded-card border border-border bg-surface p-2 shadow-raised md:bottom-4">
          {needsSlot && !slotId && <p className="px-2 text-sm text-warning">{text.pickSlot}</p>}
          <Button
            block
            type="button"
            disabled={needsSlot && !slotId}
            icon={<ShoppingCart aria-hidden className="size-4" />}
            onClick={() => checkout.review(changes, { slotId: booking ? null : slotId, keepSlotWeekly: weekly.keep, autoPayFromWallet: weekly.keep && weekly.auto })}
          >
            {interpolate(shopText.review, { n: changed.length })}
          </Button>
        </div>
      )}
      {checkout.sheet}
    </div>
  );
}

function SlotPicker({
  days,
  selected,
  current,
  text,
  onPick,
  onKeep,
}: {
  days: [string, ServiceDay["slots"]][];
  selected: string | null;
  current: string | null;
  text: Text;
  onPick: (id: string) => void;
  onKeep?: () => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{text.slots}</legend>
      <p className="text-sm text-muted">{text.slotsHint}</p>
      {days.map(([day, slots]) => (
        <div key={day} className="space-y-2">
          <p className="text-sm font-semibold text-fg">{day}</p>
          <div className="grid grid-cols-2 gap-2">
            {slots.map((slot) => {
              const full = slot.seatsLeft === 0 && slot.id !== current;
              const checked = selected === slot.id;
              return (
                <label
                  key={slot.id}
                  className={cn(
                    "relative flex min-h-14 cursor-pointer flex-col justify-center rounded-control border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                    checked ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-border bg-surface text-fg hover:border-brand/50",
                    full && "cursor-not-allowed bg-surface-2 text-subtle hover:border-border",
                  )}
                >
                  <input type="radio" name="slot" value={slot.id} checked={checked} disabled={full} onChange={() => onPick(slot.id)} className="sr-only" />
                  <span className="font-medium tabular-nums">{slot.time}</span>
                  <span className={cn("text-xs", full ? "text-subtle" : "text-muted")}>{full ? text.full : interpolate(text.seatsLeft, { n: slot.seatsLeft })}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {onKeep && (
        <Button type="button" size="sm" variant="ghost" onClick={onKeep}>
          {text.keepSlot}
        </Button>
      )}
    </fieldset>
  );
}

"use client";

import { RotateCcw, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { computeMeter } from "@/lib/pricing/meter";
import { formatINR } from "@/lib/pricing/money";
import { unitPriceAt } from "@/lib/pricing/price";
import { checkoutAction, confirmRazorpayAction, quoteCartAction, type CartQuote, type CheckoutOutcome } from "@/server/actions/shop";
import type { Shop, ShopItem } from "@/server/shop";
import { Button, IconButton } from "../ui/button";
import { cn } from "../ui/cn";
import { FormErrors } from "../ui/form-errors";
import { Price } from "../ui/display";
import { TierMeter } from "../ui/progress";
import { SheetDialog } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { QuantityStepper } from "../ui/stepper";
import { useToast } from "../ui/toast";
import { openRazorpay } from "./razorpay";

type Text = Messages["shop"];

/**
 * The grocery list for one round. Quantities change locally and instantly (meters preview the
 * community total with your changes); the server prices the whole change when you review it.
 */
export function GroceryShop({ shop, text }: { shop: Shop; text: Text }) {
  const { round, items } = shop;
  const router = useRouter();
  const toast = useToast();
  const initial = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.myQty])), [items]);
  const [targets, setTargets] = useState<Record<string, number>>(initial);
  // Fresh server data (after a paid change) resets the cart to what is actually held.
  const [base, setBase] = useState(initial);
  if (base !== initial) {
    setBase(initial);
    setTargets(initial);
  }
  // What the resident holds; jumps to the new quantities as soon as a change is paid.
  const [held, setHeld] = useOptimistic(initial);
  const [category, setCategory] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const changed = items.filter((i) => targets[i.id] !== held[i.id]);
  const changes = Object.fromEntries(changed.map((i) => [i.id, targets[i.id]]));
  const categories = [...new Map(items.map((i) => [i.category, i.categoryLabel])).entries()];
  const visible = category ? items.filter((i) => i.category === category) : items;

  function review() {
    setReviewing(true);
    setQuote(null);
    setErrors([]);
    startTransition(async () => setQuote(await quoteCartAction(round.id, changes)));
  }

  function finish(outcome: CheckoutOutcome) {
    if (outcome.status === "DONE") {
      setReviewing(false);
      toast(outcome.celebrate ? { tone: "celebrate", title: outcome.celebrate } : { tone: "success", title: outcome.message });
      return;
    }
    if (outcome.status === "REDIRECT") {
      setReviewing(false);
      router.push(outcome.url);
      return;
    }
    if (outcome.status === "ERROR") {
      setErrors(outcome.errors);
      return;
    }
    void openRazorpay({
      keyId: outcome.keyId,
      orderId: outcome.orderId,
      amountPaise: outcome.amountPaise,
      description: outcome.description,
      contact: outcome.contact,
      onPaid: (paid) =>
        startTransition(async () => {
          const confirmed = await confirmRazorpayAction({ paymentId: outcome.paymentId, ...paid });
          if (confirmed.status === "DONE") startTransition(() => setHeld(targets));
          finish(confirmed);
        }),
      onDismiss: () => setReviewing(false),
    });
  }

  function pay() {
    setErrors([]);
    startTransition(async () => {
      const outcome = await checkoutAction(round.id, changes);
      if (outcome.status === "DONE") startTransition(() => setHeld(targets));
      finish(outcome);
    });
  }

  return (
    <div className="space-y-4">
      {categories.length > 1 && (
        <div role="group" aria-label={text.categories} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip selected={category === null} onClick={() => setCategory(null)}>
            {text.all}
          </FilterChip>
          {categories.map(([key, label]) => (
            <FilterChip key={key} selected={category === key} onClick={() => setCategory(key)}>
              {label}
            </FilterChip>
          ))}
        </div>
      )}

      <ul className="space-y-3">
        {visible.map((item) => (
          <ShopRow
            key={item.id}
            item={item}
            marginBps={round.marginBps}
            target={targets[item.id]}
            held={held[item.id]}
            canAdd={round.canAdd}
            canReduce={round.canReduce}
            text={text}
            onChange={(qty) => setTargets((t) => ({ ...t, [item.id]: qty }))}
          />
        ))}
      </ul>

      {changed.length > 0 && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-card border border-border bg-surface p-2 shadow-raised md:bottom-4">
          <IconButton label={text.undo} onClick={() => setTargets(held)}>
            <RotateCcw aria-hidden className="size-5" />
          </IconButton>
          <Button className="flex-1" icon={<ShoppingCart aria-hidden className="size-4" />} onClick={review} type="button">
            {interpolate(text.review, { n: changed.length })}
          </Button>
        </div>
      )}
      {round.canReduce && changed.length === 0 && items.some((i) => held[i.id] > 0) && (
        <div className="flex justify-end">
          <Button
            variant="dangerGhost"
            size="sm"
            type="button"
            icon={<Trash2 aria-hidden className="size-4" />}
            onClick={() => setTargets(Object.fromEntries(items.map((i) => [i.id, 0])))}
          >
            {text.removeAll}
          </Button>
        </div>
      )}

      <SheetDialog open={reviewing} onClose={() => setReviewing(false)} title={text.reviewTitle}>
        <ReviewBody quote={quote} errors={errors} pending={pending} text={text} wallet={formatINR(shop.walletPaise)} onPay={pay} />
      </SheetDialog>
    </div>
  );
}

function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
        selected ? "border-brand bg-brand-soft font-medium text-brand-soft-fg" : "border-border bg-surface text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function ShopRow({
  item,
  marginBps,
  target,
  held,
  canAdd,
  canReduce,
  text,
  onChange,
}: {
  item: ShopItem;
  marginBps: number;
  target: number;
  held: number;
  canAdd: boolean;
  canReduce: boolean;
  text: Text;
  onChange: (qty: number) => void;
}) {
  const pricing = { tierBasis: "UNITS" as const, tiers: item.tiers, marginBps, gstBps: item.gstBps, minOrderQty: item.minOrderQty, mrpPaise: item.mrpPaise };
  // Preview: the community total if this change goes through.
  const meter = computeMeter(pricing, item.basisCount + (target - held));
  const price = unitPriceAt(pricing, item.basisCount).totalPaise;
  const max = canAdd ? Math.max(item.maxQtyPerFlat - item.flatOthersQty, held) : held;
  const label = item.pack ? `${item.name} ${item.pack}` : item.name;

  return (
    <li className={cn("rounded-card border bg-surface p-3 shadow-card", target !== held ? "border-brand" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-fg">{item.name}</p>
          <p className="text-xs text-muted">{[item.pack, interpolate(text.limit, { n: item.maxQtyPerFlat })].filter(Boolean).join(" · ")}</p>
          <div className="mt-1">
            <Price paise={price} mrpPaise={item.mrpPaise} suffix={interpolate(text.perPack, { unit: item.words.one })} />
          </div>
        </div>
        <QuantityStepper value={target} onChange={onChange} label={label} min={canReduce ? 0 : held} max={max} decreaseDisabled={!canReduce && target <= held} />
      </div>
      <div className="mt-2.5">
        <TierMeter meter={meter} basisWords={item.words} compact />
      </div>
      {(held > 0 || item.flatOthersQty > 0) && (
        <p className="mt-2 text-xs text-muted">
          {held > 0 && interpolate(text.inYourOrder, { qty: held, paid: formatINR(item.myPaidPaise) })}
          {held > 0 && item.flatOthersQty > 0 && " · "}
          {item.flatOthersQty > 0 && interpolate(text.household, { qty: item.flatOthersQty })}
        </p>
      )}
    </li>
  );
}

function ReviewBody({
  quote,
  errors,
  pending,
  text,
  wallet,
  onPay,
}: {
  quote: CartQuote | null;
  errors: string[];
  pending: boolean;
  text: Text;
  wallet: string;
  onPay: () => void;
}) {
  if (!quote) {
    return (
      <div role="status" className="space-y-3">
        <p className="text-sm text-muted">{text.checking}</p>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (!quote.ok) return <FormErrors errors={quote.errors} />;
  return (
    <div className="space-y-4">
      <FormErrors errors={errors} />
      <ul className="divide-y divide-border">
        {quote.lines.map((line) => (
          <li key={line.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className={cn("mr-1.5 font-semibold tabular-nums", line.refund ? "text-success" : "text-brand")}>{line.change}</span>
              {line.name}
            </span>
            <span className="shrink-0 text-muted tabular-nums">{line.amount}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-border pt-3 text-sm tabular-nums">
        <Row label={text.newItems} value={quote.charge} />
        {quote.creditPaise > 0 && <Row label={text.refund} value={quote.credit} />}
        {quote.walletAppliedPaise > 0 && <Row label={text.walletApplied} value={quote.wallet} />}
        <Row label={text.toPay} value={quote.gateway} strong />
      </dl>
      <p className="text-xs text-muted">{text.priceNote}</p>
      <p className="text-xs text-subtle">{interpolate(text.wallet, { amount: wallet })}</p>
      <Button block loading={pending} onClick={onPay} type="button">
        {quote.gatewayPaise > 0 ? interpolate(text.payUpi, { amount: quote.gateway }) : text.confirmFree}
      </Button>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", strong ? "text-base font-semibold text-fg" : "text-muted")}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

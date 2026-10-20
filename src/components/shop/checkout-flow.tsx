"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Messages } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { formatINR } from "@/lib/pricing/money";
import type { BookingIntent } from "@/server/checkout";
import { checkoutAction, confirmRazorpayAction, quoteCartAction, type CartQuote, type CheckoutOutcome } from "@/server/actions/shop";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { FormErrors } from "../ui/form-errors";
import { SheetDialog } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { openRazorpay } from "./razorpay";

type Text = Messages["shop"];

/**
 * Review and pay, shared by groceries and Service Days: the server prices the change, then it is
 * applied from the wallet, paid on the test UPI screen, or paid with Razorpay. `onPaid` runs inside
 * a transition as soon as a change goes through, for optimistic updates.
 */
export function useCheckout({ roundId, text, walletPaise, onPaid }: { roundId: string; text: Text; walletPaise: number; onPaid: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reviewing, setReviewing] = useState(false);
  const [request, setRequest] = useState<{ changes: Record<string, number>; booking?: BookingIntent }>({ changes: {} });
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function review(changes: Record<string, number>, booking?: BookingIntent) {
    setRequest({ changes, booking });
    setReviewing(true);
    setQuote(null);
    setErrors([]);
    startTransition(async () => setQuote(await quoteCartAction(roundId, changes, booking)));
  }

  function finish(outcome: CheckoutOutcome) {
    if (outcome.status === "DONE") {
      setReviewing(false);
      startTransition(onPaid);
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
      onPaid: (paid) => startTransition(async () => finish(await confirmRazorpayAction({ paymentId: outcome.paymentId, ...paid }))),
      onDismiss: () => setReviewing(false),
    });
  }

  function pay() {
    setErrors([]);
    startTransition(async () => finish(await checkoutAction(roundId, request.changes, request.booking)));
  }

  const sheet = (
    <SheetDialog open={reviewing} onClose={() => setReviewing(false)} title={text.reviewTitle}>
      <ReviewBody quote={quote} errors={errors} pending={pending} text={text} wallet={formatINR(walletPaise)} onPay={pay} />
    </SheetDialog>
  );
  return { review, sheet, pending };
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

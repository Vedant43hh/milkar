"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { t, type MessageKey } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { setFlash } from "@/lib/flash";
import { formatINR } from "@/lib/pricing/money";
import { confirmPayment, failPayment, getPaymentForUser, quoteCart, startCheckout, type CheckoutErrors, type ConfirmResult, type Shopper } from "@/server/checkout";
import { verifyRazorpaySignature } from "@/server/payments/razorpay";
import type { ResidentUser } from "@/server/session";

const shopperOf = (user: ResidentUser): Shopper => ({ id: user.id, flatId: user.flatId, communityId: user.flat.community.id });

/** Whole, non-negative quantities only; anything else is rejected by the quote. */
function cleanTargets(targets: unknown): Record<string, number> {
  if (!targets || typeof targets !== "object") return {};
  return Object.fromEntries(Object.entries(targets as Record<string, unknown>).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, v as number]));
}

function errorTexts(errors: CheckoutErrors, names: Record<string, string>): string[] {
  return [
    ...new Set(
      errors.map((e) => {
        const item = (e.offeringId && names[e.offeringId]) || "";
        const max = "maxAllowed" in e ? (e.maxAllowed ?? 0) : 0;
        return t(`shop.errors.${e.code}` as MessageKey, { item, max });
      }),
    ),
  ];
}

export type CartQuote =
  | {
      ok: true;
      lines: { name: string; change: string; amount: string; refund: boolean }[];
      charge: string;
      credit: string;
      wallet: string;
      gateway: string;
      gatewayPaise: number;
      creditPaise: number;
      walletAppliedPaise: number;
    }
  | { ok: false; errors: string[] };

/** Prices the cart for the review sheet. Nothing is saved. */
export async function quoteCartAction(roundId: string, targets: Record<string, number>): Promise<CartQuote> {
  const user = await requireArea("resident");
  const result = await quoteCart(shopperOf(user), roundId, cleanTargets(targets), new Date());
  if (!result.ok) return { ok: false, errors: errorTexts(result.errors, result.names) };
  const { quote, names } = result;
  return {
    ok: true,
    lines: quote.lines.map((l) =>
      l.addQty > 0
        ? { name: names[l.offeringId], change: `+${l.addQty}`, amount: t("shop.lineAdd", { qty: l.addQty, price: formatINR(l.addUnitPaise) }), refund: false }
        : { name: names[l.offeringId], change: `−${l.removeQty}`, amount: t("shop.refundLine", { amount: formatINR(l.creditPaise) }), refund: true },
    ),
    charge: formatINR(quote.chargePaise),
    credit: formatINR(quote.creditPaise),
    wallet: formatINR(quote.walletAppliedPaise),
    gateway: formatINR(quote.gatewayPaise),
    gatewayPaise: quote.gatewayPaise,
    creditPaise: quote.creditPaise,
    walletAppliedPaise: quote.walletAppliedPaise,
  };
}

export type CheckoutOutcome =
  | { status: "DONE"; message: string; celebrate: string | null }
  | { status: "REDIRECT"; url: string }
  | { status: "RAZORPAY"; keyId: string; orderId: string; paymentId: string; amountPaise: number; description: string; contact: string }
  | { status: "ERROR"; errors: string[] };

function confirmedText(result: ConfirmResult): { message: string; celebrate: string | null } {
  if (result.status === "PAID") {
    const unlock = result.unlocked[0];
    return { message: t("shop.updated"), celebrate: unlock ? t("shop.unlocked", { item: unlock.item, price: formatINR(unlock.pricePaise) }) : null };
  }
  if (result.status === "CREDITED_TO_WALLET") {
    const reason = t(`shop.creditReasons.${result.reason}` as MessageKey);
    return { message: t("shop.credited", { reason, amount: formatINR(result.amountPaise) }), celebrate: null };
  }
  return { message: t("errors.generic"), celebrate: null };
}

/** Places the change. Wallet-covered changes are done at once; otherwise the resident goes to pay. */
export async function checkoutAction(roundId: string, targets: Record<string, number>): Promise<CheckoutOutcome> {
  const user = await requireArea("resident");
  const result = await startCheckout(shopperOf(user), roundId, cleanTargets(targets), new Date());
  if (result.status === "REJECTED") return { status: "ERROR", errors: errorTexts(result.errors, result.names) };
  if (result.status === "PAID") {
    refresh();
    const unlock = result.unlocked[0];
    return { status: "DONE", message: t("shop.updated"), celebrate: unlock ? t("shop.unlocked", { item: unlock.item, price: formatINR(unlock.pricePaise) }) : null };
  }
  if (result.provider === "RAZORPAY") {
    return {
      status: "RAZORPAY",
      keyId: getEnv().RAZORPAY_KEY_ID ?? "",
      orderId: result.providerOrderId,
      paymentId: result.paymentId,
      amountPaise: result.gatewayPaise,
      description: t("pay.razorpayDescription"),
      contact: user.phone,
    };
  }
  return { status: "REDIRECT", url: `/pay/${result.paymentId}` };
}

/** Razorpay Checkout's success handler: verify the signature, then confirm. */
export async function confirmRazorpayAction(input: { paymentId: string; razorpayOrderId: string; razorpayPaymentId: string; signature: string }): Promise<CheckoutOutcome> {
  const user = await requireArea("resident");
  const payment = await getPaymentForUser(input.paymentId, user.id);
  const secret = getEnv().RAZORPAY_KEY_SECRET;
  const valid =
    !!payment &&
    !!secret &&
    payment.providerOrderId === input.razorpayOrderId &&
    verifyRazorpaySignature({ orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, signature: input.signature }, secret);
  if (!valid) return { status: "ERROR", errors: [t("pay.invalid")] };
  const result = await confirmPayment(input.paymentId, input.razorpayPaymentId, new Date());
  refresh();
  return { status: "DONE", ...confirmedText(result) };
}

/** The test UPI screen's "Pay" button. */
export async function payMockAction(formData: FormData): Promise<void> {
  const user = await requireArea("resident");
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await getPaymentForUser(paymentId, user.id);
  if (!payment || payment.provider !== "MOCK") redirect("/groceries");
  const result = await confirmPayment(paymentId, `mock_pay_${crypto.randomUUID().slice(0, 12)}`, new Date());
  const text = confirmedText(result);
  if (text.celebrate) await setFlash("celebrate", "shop.flashText", { text: text.celebrate });
  else await setFlash(result.status === "PAID" ? "success" : "info", "shop.flashText", { text: text.message });
  redirect(`/groceries?round=${payment.roundId}`);
}

/** The test UPI screen's "Cancel payment" button. */
export async function declineMockAction(formData: FormData): Promise<void> {
  const user = await requireArea("resident");
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await getPaymentForUser(paymentId, user.id);
  if (payment) await failPayment(paymentId, user.id, "Declined by the resident");
  await setFlash("info", "pay.declined");
  redirect(payment ? `/groceries?round=${payment.roundId}` : "/groceries");
}

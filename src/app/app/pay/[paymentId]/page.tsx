import { CircleCheck, CircleX, FlaskConical, IndianRupee, TimerOff } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { isQuoteExpired } from "@/lib/pricing/rules";
import { formatIST } from "@/lib/time";
import { declineMockAction, payMockAction } from "@/server/actions/shop";
import { getPaymentForUser } from "@/server/checkout";

export const metadata: Metadata = { title: t("pay.title") };

export default function PayPage({ params }: PageProps<"/app/pay/[paymentId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <Pay params={params} />
    </Suspense>
  );
}

/** The built-in test UPI screen, used when Razorpay keys aren't configured. */
async function Pay({ params }: { params: PageProps<"/app/pay/[paymentId]">["params"] }) {
  const user = await requirePortal("app");
  const { paymentId } = await params;
  const payment = await getPaymentForUser(paymentId, user.id);
  if (!payment || payment.provider !== "MOCK") notFound();
  const now = new Date();
  const back = (
    <ButtonLink
      href={payment.purpose === "PARTS" ? `/app/orders/${payment.roundId}` : payment.round.kind === "SERVICE" ? `/app/services/${payment.roundId}` : `/app/groceries?round=${payment.roundId}`}
      variant="secondary"
      block
    >
      {t("pay.back")}
    </ButtonLink>
  );

  if (payment.status === "PAID" || payment.status === "CREDITED_TO_WALLET") {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Banner tone="success" icon={<CircleCheck aria-hidden className="size-4" />}>
          {t("pay.done")}
        </Banner>
        {back}
      </div>
    );
  }
  if (payment.status === "FAILED") {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Banner icon={<CircleX aria-hidden className="size-4" />}>{t("pay.declined")}</Banner>
        {back}
      </div>
    );
  }
  if (payment.status === "EXPIRED" || isQuoteExpired(payment.expiresAt, now)) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Banner tone="warning" icon={<TimerOff aria-hidden className="size-4" />}>
          {t("pay.expired")}
        </Banner>
        {back}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{t("pay.title")}</h1>
      <Banner tone="accent" icon={<FlaskConical aria-hidden className="size-4" />}>
        {t("pay.testMode")}
      </Banner>
      <Card className="space-y-4 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
          <IndianRupee aria-hidden className="size-7" />
        </span>
        <div>
          <p className="text-sm text-muted">{t("pay.payee")}</p>
          <p className="text-sm text-muted">{t(payment.purpose === "PARTS" ? "pay.forParts" : "pay.for", { round: payment.round.title })}</p>
        </div>
        <div>
          <p className="text-sm text-muted">{t("pay.amount")}</p>
          <p className="text-4xl font-semibold text-fg tabular-nums">{formatINR(payment.gatewayPaise)}</p>
          {payment.walletAppliedPaise > 0 && <p className="mt-1 text-sm text-muted">{t("pay.walletPart", { amount: formatINR(payment.walletAppliedPaise) })}</p>}
        </div>
        <p className="text-xs text-subtle">{t("pay.expires", { time: formatIST(payment.expiresAt, "time") })}</p>
        <form action={payMockAction}>
          <input type="hidden" name="paymentId" value={payment.id} />
          <SubmitButton block size="lg">
            {t("pay.payNow", { amount: formatINR(payment.gatewayPaise) })}
          </SubmitButton>
        </form>
        <form action={declineMockAction}>
          <input type="hidden" name="paymentId" value={payment.id} />
          <SubmitButton block variant="ghost">
            {t("pay.decline")}
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}

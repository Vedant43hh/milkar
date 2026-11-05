import { Badge, type Tone } from "@/components/ui/badge";
import { t } from "@/i18n";
import { formatINR } from "@/lib/pricing/money";
import type { Payout, PayoutStatus } from "@/lib/vendor/payout";

const STATUS_TONE: Record<PayoutStatus, Tone> = { ISSUED: "warning", ACKNOWLEDGED: "brand", PAID: "success" };

export function OrderStatusBadge({ status }: { status: PayoutStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{t(`vendorOrders.status.${status}`)}</Badge>;
}

/** The order total, each kind of change, and what the vendor is paid. */
export function PayoutBreakdown({ payout }: { payout: Payout }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-muted">{t("vendorOrders.total")}</dt>
        <dd className="font-medium text-fg tabular-nums">{formatINR(payout.orderPaise)}</dd>
      </div>
      {payout.changes.map((c) => (
        <div key={c.type} className="flex justify-between gap-3">
          <dt className="text-muted">{t("vendorOrders.changeCount", { label: t(`vendorOrders.change.${c.type}`), n: c.count })}</dt>
          <dd className={c.amountPaise < 0 ? "text-danger tabular-nums" : "text-success tabular-nums"}>
            {c.amountPaise > 0 ? "+" : ""}
            {formatINR(c.amountPaise)}
          </dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-border pt-1.5">
        <dt className="font-semibold text-fg">{t("vendorOrders.payout")}</dt>
        <dd className="font-semibold text-fg tabular-nums">{formatINR(payout.payoutPaise)}</dd>
      </div>
    </dl>
  );
}

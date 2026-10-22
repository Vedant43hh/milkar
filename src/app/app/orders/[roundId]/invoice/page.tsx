import { ChevronLeft, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/orders/print-button";
import { Banner } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { getInvoice } from "@/server/history";

export const metadata: Metadata = { title: t("invoice.title") };

export default function InvoicePage({ params }: PageProps<"/app/orders/[roundId]/invoice">) {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <InvoiceView params={params} />
    </Suspense>
  );
}

const pct = (bps: number) => String(bps / 100);

/** A GST invoice for the resident's confirmed items in a round, laid out to print on A4. */
async function InvoiceView({ params }: { params: PageProps<"/app/orders/[roundId]/invoice">["params"] }) {
  const user = await requirePortal("app");
  const { roundId } = await params;
  const result = await getInvoice({ id: user.id, flatId: user.flatId, communityId: user.flat.community.id, name: user.name }, roundId);
  if (!result) notFound();
  const { invoice, round, money } = result;
  const { totals } = invoice;
  const taxRows: [string, number][] = invoice.interState
    ? [[t("invoice.totals.igst"), totals.igstPaise]]
    : [
        [t("invoice.totals.cgst"), totals.cgstPaise],
        [t("invoice.totals.sgst"), totals.sgstPaise],
      ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/app/orders/${round.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
          <ChevronLeft aria-hidden className="size-4" />
          {t("invoice.back")}
        </Link>
        <PrintButton label={t("invoice.print")} />
      </div>
      {!invoice.supplier.gstin && (
        <div className="print:hidden">
          <Banner tone="warning" icon={<Info aria-hidden className="size-4" />}>
            {t("invoice.sampleNote")}
          </Banner>
        </div>
      )}

      <article className="space-y-5 rounded-card border border-border bg-surface p-4 text-sm shadow-card sm:p-6 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{invoice.supplier.gstin ? t("invoice.taxTitle") : t("invoice.title")}</h1>
            <p className="text-muted">{t("invoice.round", { round: round.title })}</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right">
            <dt className="text-muted">{t("invoice.number")}</dt>
            <dd className="font-medium text-fg tabular-nums">{invoice.number}</dd>
            <dt className="text-muted">{t("invoice.date")}</dt>
            <dd className="text-fg">{formatIST(invoice.date, "date")}</dd>
            {invoice.placeOfSupply && (
              <>
                <dt className="text-muted">{t("invoice.placeOfSupply")}</dt>
                <dd className="text-fg">
                  {invoice.placeOfSupply.name} ({invoice.placeOfSupply.code})
                </dd>
              </>
            )}
          </dl>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("invoice.supplier")}</h2>
            <p className="font-medium text-fg">{invoice.supplier.name}</p>
            {invoice.supplier.gstin && <p className="text-muted">{t("invoice.gstin", { gstin: invoice.supplier.gstin })}</p>}
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t("invoice.buyer")}</h2>
            <p className="font-medium text-fg">{invoice.buyer.name}</p>
            <p className="text-muted">{invoice.buyer.address}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-strong text-xs text-muted">
              <th scope="col" className="py-2 pr-2 font-medium">
                {t("invoice.columns.item")}
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                {t("invoice.columns.qty")}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t("invoice.columns.amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={i} className="border-b border-border align-top">
                <td className="py-2 pr-2">
                  <span className="block font-medium text-fg">{line.description}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {t("invoice.columns.rate")} {formatINR(line.unitPaise)} · {t("invoice.columns.taxable")} {formatINR(line.taxablePaise)} · {t("invoice.columns.gst")}{" "}
                    {t("invoice.gstRate", { rate: pct(line.gstBps) })}
                  </span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{line.quantity}</td>
                <td className="py-2 text-right font-medium text-fg tabular-nums">{formatINR(line.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className="pt-3 pr-2 text-right font-normal text-muted">
                {t("invoice.totals.taxable")}
              </th>
              <td className="pt-3 text-right tabular-nums">{formatINR(totals.taxablePaise)}</td>
            </tr>
            {taxRows.map(([label, amount]) => (
              <tr key={label}>
                <th scope="row" colSpan={2} className="pr-2 text-right font-normal text-muted">
                  {label}
                </th>
                <td className="text-right tabular-nums">{formatINR(amount)}</td>
              </tr>
            ))}
            <tr className="text-base">
              <th scope="row" colSpan={2} className="pt-1 pr-2 text-right font-semibold text-fg">
                {t("invoice.totals.total")}
              </th>
              <td className="pt-1 text-right font-semibold text-fg tabular-nums">{formatINR(totals.totalPaise)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-labelledby="tax-summary">
            <h2 id="tax-summary" className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {t("invoice.byRateTitle")}
            </h2>
            <dl className="space-y-0.5">
              {invoice.byRate.map((row) => (
                <div key={row.gstBps} className="flex justify-between gap-3">
                  <dt className="text-muted">{t("invoice.byRateRow", { rate: pct(row.gstBps) })}</dt>
                  <dd className="text-fg tabular-nums">
                    {formatINR(row.taxablePaise)} + {formatINR(row.gstPaise)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="payments">
            <h2 id="payments" className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {t("invoice.paymentTitle")}
            </h2>
            <dl className="space-y-0.5">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("invoice.paid")}</dt>
                <dd className="text-fg tabular-nums">{formatINR(money.paidPaise)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("invoice.refunded")}</dt>
                <dd className="text-fg tabular-nums">−{formatINR(money.refundedPaise)}</dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt className="text-fg">{t("invoice.net")}</dt>
                <dd className="text-fg tabular-nums">{formatINR(money.netPaise)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <p className="text-xs text-muted">{t("invoice.note")}</p>
      </article>
    </div>
  );
}

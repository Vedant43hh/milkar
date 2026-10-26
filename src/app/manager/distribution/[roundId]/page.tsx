import { ChevronLeft, CircleCheck, PackageX, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { Field, Input, Label } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatINR } from "@/lib/pricing/money";
import { formatIST } from "@/lib/time";
import { collectPickupAction, reportDeliveryIssueAction } from "@/server/actions/manager";
import { getDistribution } from "@/server/distribution";
import { actorOf } from "@/server/rounds";

export const metadata: Metadata = { title: t("distribution.title") };

export default function DistributionRoundPage({ params }: PageProps<"/manager/distribution/[roundId]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Checklist params={params} />
    </Suspense>
  );
}

type Data = NonNullable<Awaited<ReturnType<typeof getDistribution>>>;
type Flat = Data["flats"][number];

/** Every flat's bag for one grocery round: check the code, hand it over, refund anything missing. */
async function Checklist({ params }: { params: PageProps<"/manager/distribution/[roundId]">["params"] }) {
  const user = await requirePortal("manager");
  const { roundId } = await params;
  const data = await getDistribution(actorOf(user), roundId);
  if (!data) notFound();
  const { round, flats, progress } = data;
  const pending = flats.filter((f) => f.pickup?.status !== "COLLECTED");
  const collected = flats.filter((f) => f.pickup?.status === "COLLECTED");
  const progressText = t("distribution.progress", { collected: progress.collected, total: progress.total });

  return (
    <div className="space-y-4">
      <Link href="/manager/distribution" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("distribution.back")}
      </Link>
      <PageHeader title={round.title} subtitle={t("distribution.deliveredOn", { when: formatIST(round.deliveryAt) })} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-fg">{progressText}</p>
        <ProgressBar value={(progress.collected / Math.max(1, progress.total)) * 100} label={progressText} tone={progress.done ? "success" : "brand"} />
      </div>
      {round.status === "COMPLETED" && (
        <Banner tone="success" icon={<CircleCheck aria-hidden className="size-4" />}>
          {t("distribution.allDone")}
        </Banner>
      )}
      <ul className="space-y-3">
        {[...pending, ...collected].map((flat) => (
          <FlatBag key={flat.flatId} flat={flat} round={round} />
        ))}
      </ul>
    </div>
  );
}

function FlatBag({ flat, round }: { flat: Flat; round: Data["round"] }) {
  const label = t("distribution.flat", { unit: round.unitLabel, flat: `${flat.tower}-${flat.flatNumber}` });
  const done = flat.pickup?.status === "COLLECTED";
  return (
    <li className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <ShoppingBag aria-hidden className="size-5 text-brand" />
          {label}
        </h2>
        <Badge tone={done ? "success" : "neutral"}>{done ? t("distribution.collectedAt", { when: formatIST(flat.pickup!.collectedAt!, "time") }) : t("distribution.pending")}</Badge>
      </div>
      <ul className="space-y-0.5 text-sm">
        {flat.items.map((item) => (
          <li key={item.productId} className="flex justify-between gap-3">
            <span className="text-fg">{item.productName}</span>
            <span className="font-medium text-fg tabular-nums">× {item.quantity}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        {!done && round.status === "FINALIZED" && (
          <ActionForm action={collectPickupAction} className="flex flex-1 flex-wrap items-end gap-2">
            <input type="hidden" name="roundId" value={round.id} />
            <input type="hidden" name="flatId" value={flat.flatId} />
            {round.requirePickupCode && (
              <div className="w-32">
                <Label htmlFor={`code-${flat.flatId}`}>
                  {t("distribution.code")}
                  <span className="sr-only"> {label}</span>
                </Label>
                <Input id={`code-${flat.flatId}`} name="code" required inputMode="numeric" pattern="[0-9 ]{4,5}" maxLength={5} autoComplete="off" className="text-center tracking-widest tabular-nums" />
              </div>
            )}
            <SubmitButton icon={<CircleCheck aria-hidden className="size-4" />}>
              {round.requirePickupCode ? t("distribution.collect") : t("distribution.collectNoCode")}
              <span className="sr-only"> {label}</span>
            </SubmitButton>
          </ActionForm>
        )}
        <Sheet
          title={`${t("distribution.reportTitle")}: ${label}`}
          trigger={
            <>
              <PackageX aria-hidden className="size-4" />
              {t("distribution.report")}
              <span className="sr-only"> {label}</span>
            </>
          }
          triggerClassName={buttonClasses({ variant: "ghost", size: "sm" })}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("distribution.reportBody")}</p>
            {flat.orderItems.map((item) => (
              <ActionForm key={item.id} action={reportDeliveryIssueAction} className="space-y-2 rounded-control border border-border p-3">
                <input type="hidden" name="orderItemId" value={item.id} />
                <p className="text-sm font-medium text-fg">
                  {item.name} × {item.quantity}
                  {flat.orderItems.length > 1 && <span className="font-normal text-muted"> · {t("distribution.owner", { name: item.owner ?? "" })}</span>}
                </p>
                {item.refundPaise > 0 && <p className="text-xs text-success">{t("distribution.already", { n: formatINR(item.refundPaise) })}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Field id={`short-${item.id}`} label={t("distribution.short")}>
                    {(aria) => <Input {...aria} name="short" type="number" min={item.shortQty} max={item.quantity} required defaultValue={item.shortQty} inputMode="numeric" />}
                  </Field>
                  <Field id={`damaged-${item.id}`} label={t("distribution.damaged")}>
                    {(aria) => <Input {...aria} name="damaged" type="number" min={item.damagedQty} max={item.quantity} required defaultValue={item.damagedQty} inputMode="numeric" />}
                  </Field>
                </div>
                <SubmitButton size="sm" variant="secondary">
                  {t("distribution.save")}
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Sheet>
      </div>
    </li>
  );
}

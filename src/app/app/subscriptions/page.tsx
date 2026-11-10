import { CalendarClock, Pause, Play, Repeat, ShoppingBasket } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/display";
import { Switch } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { formatIST } from "@/lib/time";
import { changeSubscriptionAction, orderThisWeekAction, setAutoPayAction } from "@/server/actions/subscriptions";
import { listSubscriptions, type Subscription } from "@/server/subscriptions";

export const metadata: Metadata = { title: t("subscriptions.title") };

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Subscriptions />
    </Suspense>
  );
}

function SubscriptionCard({ sub }: { sub: Subscription }) {
  const titleId = `sub-${sub.id}`;
  const open = sub.round.status === "OPEN";
  return (
    <Card as="li" labelledBy={titleId}>
      <CardHeader
        titleId={titleId}
        title={sub.round.title}
        action={<Badge tone={sub.status === "ACTIVE" ? "success" : "neutral"}>{t(`subscriptions.status.${sub.status}`)}</Badge>}
      />
      <ul className="space-y-1 text-sm text-fg">
        {sub.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-2">
            <ShoppingBasket aria-hidden className="size-4 shrink-0 text-muted" />
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
        <CalendarClock aria-hidden className="size-4" />
        {open ? t("subscriptions.thisWeek", { when: formatIST(sub.round.cutoffAt) }) : t("subscriptions.nextUp", { when: formatIST(sub.round.cutoffAt) })}
        {open && ` · ${t(sub.orderedThisWeek ? "subscriptions.orderedThisWeek" : "subscriptions.notOrdered")}`}
      </p>

      <ActionForm action={setAutoPayAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={sub.id} />
        <Switch name="autoPayFromWallet" label={t("subscriptions.autoPay")} defaultChecked={sub.autoPayFromWallet} />
        <SubmitButton variant="secondary" size="sm">
          {t("catalogue.save")}
        </SubmitButton>
      </ActionForm>
      <p className="text-xs text-muted">{t("subscriptions.autoPayHint")}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {open && !sub.orderedThisWeek && sub.status === "ACTIVE" && (
          <ActionForm action={orderThisWeekAction}>
            <input type="hidden" name="id" value={sub.id} />
            <SubmitButton size="sm" icon={<Repeat aria-hidden className="size-4" />}>
              {t("subscriptions.orderNow")}
            </SubmitButton>
          </ActionForm>
        )}
        <ActionForm action={changeSubscriptionAction}>
          <input type="hidden" name="id" value={sub.id} />
          <input type="hidden" name="change" value={sub.status === "ACTIVE" ? "PAUSE" : "RESUME"} />
          <SubmitButton variant="secondary" size="sm" icon={sub.status === "ACTIVE" ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}>
            {t(sub.status === "ACTIVE" ? "subscriptions.pause" : "subscriptions.resume")}
          </SubmitButton>
        </ActionForm>
        <ConfirmAction
          action={changeSubscriptionAction}
          fields={{ id: sub.id, change: "CANCEL" }}
          trigger={t("subscriptions.cancel")}
          triggerVariant="ghost"
          title={t("subscriptions.cancelTitle", { round: sub.round.title })}
          body={t("subscriptions.cancelBody")}
          confirm={t("subscriptions.cancel")}
          danger
        />
      </div>
    </Card>
  );
}

/** A resident's weekly standing orders: what's in them, auto-pay, pause, resume and cancel. */
async function Subscriptions() {
  const user = await requirePortal("app");
  const subs = await listSubscriptions(user.id);
  return (
    <div className="space-y-5">
      <PageHeader title={t("subscriptions.title")} subtitle={t("subscriptions.intro")} />
      {subs.length === 0 ? (
        <EmptyState
          icon={<Repeat aria-hidden className="size-6" />}
          title={t("subscriptions.none")}
          body={t("subscriptions.noneBody")}
          action={<ButtonLink href="/app/buys/subscriptions">{t("subscriptions.browse")}</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {subs.map((sub) => (
            <SubscriptionCard key={sub.id} sub={sub} />
          ))}
        </ul>
      )}
    </div>
  );
}

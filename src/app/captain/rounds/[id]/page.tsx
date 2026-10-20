import { ArrowRight, Ban, CalendarCheck, ChevronLeft, CircleCheck, CircleSlash, Clock, IndianRupee, KeyRound, Megaphone, Package, Repeat, ShieldCheck, Store, Truck, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoundActions } from "@/components/captain/round-actions";
import { RoundStatusBadges } from "@/components/captain/round-card";
import { offeringName, offeringWords, sortOfferings, statsOf } from "@/components/captain/round-view";
import { ShareRound } from "@/components/captain/share-round";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, SectionTitle } from "@/components/ui/card";
import { Countdown } from "@/components/ui/countdown";
import { Banner, EmptyState, Stat } from "@/components/ui/display";
import { ProgressBar, TierMeter, unitWord } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requireArea } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { relativeTime } from "@/lib/notifications";
import { formatINR } from "@/lib/pricing/money";
import { displayStatus, isTakingOrders, type OfferingStat } from "@/lib/rounds";
import { roundInviteUrl, roundShareText, whatsappUrl } from "@/lib/share";
import { formatIST, utcToIstLocal } from "@/lib/time";
import { actorOf, getRoundDashboard, type RoundDashboard } from "@/server/rounds";
import type { CaptainOffering } from "@/components/captain/round-view";

export const metadata: Metadata = { title: t("captain.roundsTitle") };

const HOUR = 3_600_000;

export default function RoundDashboardPage({ params }: PageProps<"/captain/rounds/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Dashboard params={params} />
    </Suspense>
  );
}

async function Dashboard({ params }: { params: PageProps<"/captain/rounds/[id]">["params"] }) {
  const user = await requireArea("captain");
  const { id } = await params;
  const data = await getRoundDashboard(actorOf(user), id);
  if (!data) notFound();
  const { round, recent } = data;
  const now = new Date();
  const status = displayStatus(round, now);
  const taking = isTakingOrders(round, now);
  const stats = statsOf(round);
  const statById = new Map(stats.offerings.map((s) => [s.id, s]));
  const offerings = sortOfferings(round.offerings);
  const unitLabel = round.community.unitLabel;
  const firstSlot = round.slots[0]?.startsAt ?? round.deliveryAt;
  const mustCloseBefore = round.kind === "SERVICE" ? firstSlot : round.deliveryAt;
  const extendTo = new Date(Math.min(round.cutoffAt.getTime() + 24 * HOUR, mustCloseBefore.getTime() - HOUR));

  const inviteUrl = roundInviteUrl(getEnv().APP_URL, round.community.code, round.id);
  const lead = stats.closeToUnlock[0];
  const leadOffering = lead ? round.offerings.find((o) => o.id === lead.id) : undefined;
  const shareText = roundShareText({
    kind: round.kind,
    round: round.title,
    community: round.community.name,
    cutoffAt: round.cutoffAt,
    url: inviteUrl,
    nextUnlock:
      lead?.meter.next && leadOffering
        ? {
            needed: lead.meter.next.needed,
            unit: unitWord(lead.meter.next.needed, offeringWords(leadOffering, unitLabel)),
            pricePaise: lead.meter.next.unitPaise,
            item: round.kind === "SERVICE" ? `${round.service?.name ?? ""} (${offeringName(leadOffering)})` : offeringName(leadOffering),
          }
        : null,
  });

  return (
    <div className="space-y-5">
      {taking && <AutoRefresh seconds={30} />}
      <Link href="/captain/rounds" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand">
        <ChevronLeft aria-hidden className="size-4" />
        {t("captain.roundsTitle")}
      </Link>

      <header className="space-y-2">
        <RoundStatusBadges kind={round.kind} status={status} />
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{round.title}</h1>
        <div className="space-y-0.5 text-sm text-muted">
          <p>{taking ? <Countdown to={round.cutoffAt.toISOString()} /> : t("captain.dashboard.closes", { when: formatIST(round.cutoffAt) })}</p>
          <p>
            {round.kind === "SERVICE"
              ? t("captain.dashboard.serviceOn", { when: [...new Set(round.slots.map((s) => formatIST(s.startsAt, "date")))].join(", ") })
              : t("captain.dashboard.delivery", { when: formatIST(round.deliveryAt) })}
          </p>
          {round.service && (
            <p className="flex items-center gap-1.5">
              <Store aria-hidden className="size-4" />
              {t("captain.dashboard.by", { vendor: round.service.vendor.name })}
            </p>
          )}
          {round.fromPoll && (
            <p className="flex items-center gap-1.5">
              <Megaphone aria-hidden className="size-4" />
              {t("captain.dashboard.fromPoll", { poll: round.fromPoll.title })}
            </p>
          )}
        </div>
      </header>

      <StatusBanner round={round} status={status} />

      {round.status === "OPEN" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {taking && <ShareRound whatsappHref={whatsappUrl(shareText)} inviteUrl={inviteUrl} />}
          <RoundActions roundId={round.id} takingOrders={taking} extendTo={utcToIstLocal(extendTo)} />
        </div>
      )}

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("captain.dashboard.flats")} value={stats.flats} icon={<Users aria-hidden className="size-5" />} tone="brand" />
        <Stat label={t("captain.dashboard.units")} value={stats.units} icon={<Package aria-hidden className="size-5" />} />
        <Stat label={t("captain.dashboard.collected")} value={formatINR(stats.collectedPaise)} icon={<IndianRupee aria-hidden className="size-5" />} tone="success" />
        {round.kind === "SERVICE" && <Stat label={t("captain.dashboard.held")} value={round.bookings.length} icon={<Clock aria-hidden className="size-5" />} />}
      </Card>

      {round.finalizedAt ? (
        <Results round={round} offerings={offerings} />
      ) : round.kind === "SERVICE" ? (
        <ServiceMeter round={round} offerings={offerings} stats={statById} />
      ) : (
        <GroceryMeters round={round} offerings={offerings} stats={statById} closest={stats.closeToUnlock} waiting={stats.belowMinimum} />
      )}

      {round.slots.length > 0 && <Slots slots={round.slots} />}

      <section aria-labelledby="recent-orders">
        <SectionTitle>
          <span id="recent-orders">{t("captain.dashboard.recentOrders")}</span>
        </SectionTitle>
        {recent.length === 0 ? (
          <EmptyState title={t("captain.dashboard.noOrdersYet")} body={taking ? t("captain.dashboard.noOrdersYetBody") : undefined} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{p.user.name ?? "—"}</span>
                  <span className="block text-muted">
                    {p.user.flat ? `${unitLabel} ${p.user.flat.tower}-${p.user.flat.number} · ` : ""}
                    {p.paidAt ? relativeTime(p.paidAt, now) : ""}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {p.chargePaise > 0 && <span className="block font-medium text-fg">{formatINR(p.chargePaise)}</span>}
                  {p.creditPaise > 0 && <span className="block text-muted">{t("captain.dashboard.refund", { amount: formatINR(p.creditPaise) })}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBanner({ round, status }: { round: RoundDashboard["round"]; status: ReturnType<typeof displayStatus> }) {
  if (status === "CLOSED" || status === "FINALIZING") {
    return <Banner tone="warning" icon={<Clock aria-hidden className="size-4" />}>{t("captain.dashboard.closedBanner")}</Banner>;
  }
  if (status === "CANCELLED") {
    return (
      <Banner tone="danger" icon={<Ban aria-hidden className="size-4" />} title={t("captain.dashboard.cancelledBanner")}>
        {round.cancelReason ? t("captain.dashboard.cancelledReason", { reason: round.cancelReason }) : undefined}
      </Banner>
    );
  }
  if (status === "DROPPED") {
    return <Banner tone="info" icon={<CircleSlash aria-hidden className="size-4" />}>{t("captain.dashboard.droppedBanner")}</Banner>;
  }
  if (status === "FINALIZED" || status === "COMPLETED") {
    return (
      <Banner tone="success" icon={<CircleCheck aria-hidden className="size-4" />}>
        {t(status === "FINALIZED" ? "captain.dashboard.finalizedBanner" : "captain.dashboard.completedBanner")}
      </Banner>
    );
  }
  return null;
}

/** After the cutoff job: what was confirmed at what price, where the money went, and what happens next. */
function Results({ round, offerings }: { round: RoundDashboard["round"]; offerings: CaptainOffering[] }) {
  const items = round.offerings.flatMap((o) => o.orderItems);
  const refunded = items.reduce((sum, i) => sum + (i.refundPaise ?? 0), 0);
  const absorbed = items.reduce((sum, i) => sum + (i.absorbedPaise ?? 0), 0);
  const owed = round.vendorOrders.reduce((sum, o) => sum + o.totalPaise, 0);
  const isService = round.kind === "SERVICE";
  return (
    <section aria-labelledby="results" className="space-y-3">
      <SectionTitle>
        <span id="results">{t("captain.results.title")}</span>
      </SectionTitle>
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("captain.results.refunded")} value={formatINR(refunded)} icon={<Wallet aria-hidden className="size-5" />} tone="success" />
        <Stat label={t("captain.results.vendorPayout")} value={formatINR(owed)} icon={<Truck aria-hidden className="size-5" />} />
        <Stat label={t("captain.results.absorbed")} value={formatINR(absorbed)} icon={<ShieldCheck aria-hidden className="size-5" />} />
        {isService ? (
          <Stat label={t("captain.results.visits")} value={round._count.visits} icon={<CalendarCheck aria-hidden className="size-5" />} tone="brand" />
        ) : (
          <Stat label={t("captain.results.pickups")} value={round._count.distributionRecords} icon={<KeyRound aria-hidden className="size-5" />} tone="brand" />
        )}
      </Card>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {offerings.map((o) => {
          const confirmed = o.status === "CONFIRMED";
          return (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{offeringName(o)}</span>
                {confirmed && o.finalUnitPricePaise != null && (
                  <span className="block text-muted tabular-nums">{t("captain.results.finalLine", { qty: o.finalQty ?? 0, price: formatINR(o.finalUnitPricePaise) })}</span>
                )}
              </span>
              <Badge tone={confirmed ? "success" : "neutral"}>
                {confirmed ? t("captain.results.confirmed") : o.finalQty ? t("captain.results.dropped") : t("captain.results.noOrders")}
              </Badge>
            </li>
          );
        })}
      </ul>

      {round.vendorOrders.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">{t("captain.results.vendorOrders")}</h3>
          <ul className="space-y-1 text-sm">
            {round.vendorOrders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-fg">
                  <Package aria-hidden className="size-4 shrink-0 text-muted" />
                  <span className="truncate">{t("captain.results.vendorOrder", { number: order.number, vendor: order.vendor.name })}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatINR(order.totalPaise)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {round.repeatNext && (
        <Link
          href={`/captain/rounds/${round.repeatNext.id}`}
          className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-brand/50"
        >
          <Repeat aria-hidden className="size-5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-fg">{t("captain.results.nextWeek")}</span>
            <span className="block text-sm text-muted">{t("captain.results.nextWeekBody")}</span>
          </span>
          <ArrowRight aria-hidden className="size-5 shrink-0 text-subtle" />
        </Link>
      )}
    </section>
  );
}

function GroceryMeters({
  round,
  offerings,
  stats,
  closest,
  waiting,
}: {
  round: RoundDashboard["round"];
  offerings: CaptainOffering[];
  stats: Map<string, OfferingStat>;
  closest: OfferingStat[];
  waiting: OfferingStat[];
}) {
  const unitLabel = round.community.unitLabel;
  const byId = new Map(round.offerings.map((o) => [o.id, o]));
  const meterCard = (s: OfferingStat) => {
    const o = byId.get(s.id)!;
    return (
      <li key={s.id} className="space-y-2 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-medium text-fg">{offeringName(o)}</span>
          <span className="shrink-0 text-xs text-muted tabular-nums">{t("captain.dashboard.itemStats", { units: s.units, flats: s.flats })}</span>
        </div>
        <TierMeter meter={s.meter} basisWords={offeringWords(o, unitLabel)} compact />
      </li>
    );
  };
  return (
    <>
      <section aria-labelledby="closest">
        <SectionTitle>
          <span id="closest">{t("captain.dashboard.closest")}</span>
        </SectionTitle>
        {closest.length === 0 ? (
          <p className="text-sm text-muted">{t("captain.dashboard.noUnlock")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">{closest.slice(0, 5).map(meterCard)}</ul>
        )}
      </section>
      {waiting.length > 0 && (
        <section aria-labelledby="not-started">
          <SectionTitle>
            <span id="not-started">{t("captain.dashboard.notStarted")}</span>
          </SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">{waiting.map(meterCard)}</ul>
        </section>
      )}
      <details className="group rounded-card border border-border bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-fg">
          {t("captain.dashboard.allItems")} ({offerings.length})
        </summary>
        <ul className="divide-y divide-border border-t border-border">{offerings.map((o) => meterCard(stats.get(o.id)!))}</ul>
      </details>
    </>
  );
}

function ServiceMeter({ round, offerings, stats }: { round: RoundDashboard["round"]; offerings: CaptainOffering[]; stats: Map<string, OfferingStat> }) {
  const first = offerings[0];
  if (!first) return null;
  const group = stats.get(first.id)!;
  return (
    <Card>
      <CardHeader title={round.service?.name ?? round.title} />
      <TierMeter meter={group.meter} basisWords={offeringWords(first, round.community.unitLabel)} />
      <ul className="mt-4 divide-y divide-border border-t border-border">
        {offerings.map((o) => {
          const s = stats.get(o.id)!;
          return (
            <li key={o.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium text-fg">{offeringName(o)}</span>
                <span className="block text-muted tabular-nums">{t("captain.dashboard.itemStats", { units: s.units, flats: s.flats })}</span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block font-semibold text-fg">{formatINR(s.meter.currentUnitPaise)}</span>
                {s.meter.next && <span className="block text-xs text-accent-soft-fg">{t("captain.form.tierAt", { price: formatINR(s.meter.next.unitPaise), qty: s.meter.next.minQty })}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Slots({ slots }: { slots: RoundDashboard["round"]["slots"] }) {
  const days = new Map<string, typeof slots>();
  for (const slot of slots) {
    const day = formatIST(slot.startsAt, "date");
    days.set(day, [...(days.get(day) ?? []), slot]);
  }
  return (
    <section aria-labelledby="slots">
      <SectionTitle>
        <span id="slots">{t("captain.dashboard.slots")}</span>
      </SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {[...days.entries()].map(([day, list]) => (
          <Card key={day}>
            <h3 className="mb-2 text-sm font-semibold text-fg">{day}</h3>
            <ul className="space-y-3">
              {list.map((slot) => {
                const label = `${formatIST(slot.startsAt, "time")} – ${formatIST(slot.endsAt, "time")}`;
                const full = slot.bookedCount >= slot.capacity;
                const load = t("captain.dashboard.slotLoad", { booked: slot.bookedCount, capacity: slot.capacity });
                return (
                  <li key={slot.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-fg tabular-nums">{label}</span>
                      <span className="flex items-center gap-1.5 text-muted tabular-nums">
                        {load}
                        {full && <Badge tone="danger">{t("captain.dashboard.slotFull")}</Badge>}
                      </span>
                    </div>
                    <ProgressBar value={(slot.bookedCount * 100) / slot.capacity} label={`${label}: ${load}`} tone={full ? "warning" : "brand"} />
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}

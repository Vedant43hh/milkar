import { Fuel, Info, Leaf, PiggyBank, Route, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { t } from "@/i18n";
import type { Impact } from "@/lib/impact";
import { formatINR } from "@/lib/pricing/money";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const precise = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function Figure({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="relative min-w-0 pl-11">
      <dt className="text-xs text-muted">
        <span className="absolute top-0.5 left-0 flex size-9 items-center justify-center rounded-full bg-success-soft text-success">{icon}</span>
        {label}
      </dt>
      <dd className="text-lg font-semibold text-fg tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-subtle">{hint}</dd>}
    </div>
  );
}

/**
 * What the community has achieved together: money saved against MRP, vendor trips avoided, and
 * the distance, fuel and CO₂ that adds up to. The last three are estimates and say how.
 */
export function ImpactCard({ impact, community }: { impact: Impact; community: string }) {
  const { trips, assumptions } = impact;
  const nothingYet = impact.savedPaise === 0 && trips.separate === 0;
  return (
    <Card labelledBy="impact-title">
      <CardHeader titleId="impact-title" title={t("impact.title")} subtitle={t("impact.subtitle", { community })} />
      {nothingYet ? (
        <p className="text-sm text-muted">{t("impact.empty")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4">
            <Figure icon={<PiggyBank aria-hidden className="size-4.5" />} label={t("impact.saved")} value={formatINR(impact.savedPaise)} hint={t("impact.savedHint")} />
            <Figure
              icon={<Truck aria-hidden className="size-4.5" />}
              label={t("impact.trips")}
              value={number.format(trips.avoided)}
              hint={t("impact.tripsHint", { separate: number.format(trips.separate), together: number.format(trips.together) })}
            />
            <Figure icon={<Route aria-hidden className="size-4.5" />} label={t("impact.distance")} value={t("impact.approx", { value: t("impact.km", { n: number.format(impact.km) }) })} />
            <Figure
              icon={<Fuel aria-hidden className="size-4.5" />}
              label={t("impact.fuel")}
              value={t("impact.approx", { value: t("impact.litres", { n: number.format(impact.litres) }) })}
            />
            <Figure icon={<Leaf aria-hidden className="size-4.5" />} label={t("impact.co2")} value={t("impact.approx", { value: t("impact.kg", { n: number.format(impact.kgCo2) }) })} />
          </dl>
          <details className="mt-4 rounded-control bg-surface-2 px-3 py-2 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 font-medium text-fg">
              <Info aria-hidden className="size-4 text-muted" />
              {t("impact.estimate")} {t("impact.howTitle")}
            </summary>
            <p className="mt-1 pb-1 text-muted">
              {t("impact.how", { km: precise.format(assumptions.kmPerTrip), litres: precise.format(assumptions.litresPerKm), co2: precise.format(assumptions.kgCo2PerLitre) })}
            </p>
          </details>
        </>
      )}
    </Card>
  );
}

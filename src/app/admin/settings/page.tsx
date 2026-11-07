import { Save } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { saveSettingsAction } from "@/server/actions/admin";
import { loadPlatformSettings } from "@/server/admin";

export const metadata: Metadata = { title: t("adminSettings.title") };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Settings />
    </Suspense>
  );
}

/** A stored whole number shown as the decimal a person types: 250 / 100 → "2.5". */
const shown = (value: number, per: number) => String(value / per);

async function Settings() {
  await requirePortal("admin");
  const s = await loadPlatformSettings();
  const field = (name: string, label: string, value: string, hint?: string) => (
    <Field id={name} label={label} hint={hint}>
      {(aria) => <Input {...aria} name={name} inputMode="decimal" required defaultValue={value} autoComplete="off" />}
    </Field>
  );
  return (
    <div className="space-y-5">
      <PageHeader title={t("adminSettings.title")} subtitle={t("adminSettings.intro")} />
      <ActionForm action={saveSettingsAction} className="space-y-5">
        <Card labelledBy="settings-money">
          <CardHeader titleId="settings-money" title={t("adminSettings.money")} />
          <div className="grid gap-4 sm:grid-cols-2">
            {field("margin", t("adminSettings.margin"), shown(s.marginBps, 100), t("adminSettings.marginHint"))}
            {field("freezeHours", t("adminSettings.freeze"), shown(s.reductionFreezeMinutes, 60), t("adminSettings.freezeHint"))}
            {field("fee", t("adminSettings.fee"), shown(s.defaultNoAccessFeePaise, 100), t("adminSettings.feeHint"))}
          </div>
        </Card>
        <Card labelledBy="settings-impact">
          <CardHeader titleId="settings-impact" title={t("adminSettings.impact")} subtitle={t("adminSettings.impactHint")} />
          <div className="grid gap-4 sm:grid-cols-3">
            {field("kmPerTrip", t("adminSettings.kmPerTrip"), shown(s.impactMetresPerTrip, 1000))}
            {field("litresPerKm", t("adminSettings.litresPerKm"), shown(s.impactMlPerKm, 1000))}
            {field("co2PerLitre", t("adminSettings.co2PerLitre"), shown(s.impactGramsCo2PerLitre, 1000))}
          </div>
        </Card>
        <SubmitButton icon={<Save aria-hidden className="size-4" />}>{t("adminSettings.save")}</SubmitButton>
      </ActionForm>
    </div>
  );
}

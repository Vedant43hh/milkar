import { ShieldCheck, UserMinus, UserPlus, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/manager/confirm-action";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { canManageTeam } from "@/lib/manager-rules";
import { formatPhone } from "@/lib/phone";
import { inviteAssistantAction, removeAssistantAction, saveSettingsAction } from "@/server/actions/manager";
import { getCommunityDetails, listTeam } from "@/server/team";

export const metadata: Metadata = { title: t("team.title") };

const TYPES = ["APARTMENT_SOCIETY", "GATED_COMMUNITY", "PG_COLIVING", "HOSTEL", "OFFICE_CAMPUS"] as const;

export default function TeamPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={3} />}>
      <Team />
    </Suspense>
  );
}

/** Who runs the community, and its details. Only the primary Society Manager changes either. */
async function Team() {
  const user = await requirePortal("manager");
  const { community } = user.staff;
  const [team, details] = await Promise.all([
    listTeam(community.id),
    getCommunityDetails(community.id),
  ]);
  const primary = canManageTeam(user.staff.kind);

  return (
    <div className="space-y-5">
      <PageHeader title={t("team.title")} subtitle={t("team.intro", { community: community.name })} />
      {!primary && (
        <Banner icon={<ShieldCheck aria-hidden className="size-4" />}>
          {t("team.onlyPrimary")}
        </Banner>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {team.map((member) => (
          <li key={member.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
              <UserRound aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-fg">
                {member.user.name}
                {member.user.id === user.id && <span className="text-muted"> ({t("team.you")})</span>}
              </span>
              <span className="block text-sm text-muted tabular-nums">{formatPhone(member.user.phone)}</span>
            </span>
            <Badge tone={member.kind === "PRIMARY" ? "brand" : "neutral"}>{t(member.kind === "PRIMARY" ? "team.primary" : "team.assistant")}</Badge>
            {primary && member.kind === "ASSISTANT" && (
              <ConfirmAction
                action={removeAssistantAction}
                fields={{ staffId: member.id }}
                trigger={
                  <>
                    <UserMinus aria-hidden className="size-4" />
                    <span className="sr-only">
                      {t("team.remove")} {member.user.name}
                    </span>
                  </>
                }
                triggerVariant="ghost"
                title={t("team.removeTitle", { name: member.user.name ?? "" })}
                body={t("team.removeBody", { community: community.name })}
                confirm={t("team.removeConfirm")}
                danger
              />
            )}
          </li>
        ))}
      </ul>

      {primary && (
        <Card labelledBy="invite-title">
          <CardHeader titleId="invite-title" title={t("team.inviteTitle")} subtitle={t("team.inviteBody", { community: community.name })} />
          <ActionForm action={inviteAssistantAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field id="assistant-name" label={t("team.name")}>
              {(aria) => <Input {...aria} name="name" required minLength={2} maxLength={60} autoComplete="off" />}
            </Field>
            <Field id="assistant-phone" label={t("team.phone")}>
              {(aria) => <Input {...aria} name="phone" type="tel" inputMode="numeric" required autoComplete="off" placeholder="98765 43210" />}
            </Field>
            <SubmitButton icon={<UserPlus aria-hidden className="size-4" />}>{t("team.invite")}</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card labelledBy="settings-title">
        <CardHeader titleId="settings-title" title={t("team.settingsTitle")} subtitle={t("team.settingsIntro", { community: community.name })} />
        <ActionForm action={saveSettingsAction} className="space-y-4">
          <fieldset disabled={!primary} className="space-y-4">
            <Field id="settings-name" label={t("register.community.name")}>
              {(aria) => <Input {...aria} name="name" required minLength={3} maxLength={80} defaultValue={details.name} />}
            </Field>
            <Field id="settings-type" label={t("register.community.type")}>
              {(aria) => (
                <Select {...aria} name="type" defaultValue={details.type}>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`register.community.types.${type}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="settings-address" label={t("register.community.address")}>
              {(aria) => <Input {...aria} name="address" required minLength={5} maxLength={200} defaultValue={details.address} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="settings-city" label={t("register.community.city")}>
                {(aria) => <Input {...aria} name="city" required minLength={2} maxLength={60} defaultValue={details.city} />}
              </Field>
              <Field id="settings-pincode" label={t("register.community.pincode")}>
                {(aria) => <Input {...aria} name="pincode" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} defaultValue={details.pincode} />}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="settings-block" label={t("register.community.blockLabel")} hint={t("register.community.blockLabelHint")}>
                {(aria) => <Input {...aria} name="blockLabel" required minLength={2} maxLength={20} defaultValue={details.blockLabel} />}
              </Field>
              <Field id="settings-unit" label={t("register.community.unitLabel")} hint={t("register.community.unitLabelHint")}>
                {(aria) => <Input {...aria} name="unitLabel" required minLength={2} maxLength={20} defaultValue={details.unitLabel} />}
              </Field>
            </div>
            {primary && <SubmitButton>{t("team.save")}</SubmitButton>}
          </fieldset>
        </ActionForm>
      </Card>
    </div>
  );
}

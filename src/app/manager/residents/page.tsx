import { House, Link2, UserCheck, UserMinus, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DecisionButtons } from "@/components/approvals/decision-buttons";
import { ConfirmAction } from "@/components/manager/confirm-action";
import { ShareRound } from "@/components/manager/share-round";
import { Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { relativeTime } from "@/lib/notifications";
import { formatPhone } from "@/lib/phone";
import { whatsappUrl } from "@/lib/share";
import { decideJoinAction, removeResidentAction } from "@/server/actions/manager";
import { communityResidents } from "@/server/registration";

export const metadata: Metadata = { title: t("approvals.residentsTitle") };

export default function ResidentsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Residents />
    </Suspense>
  );
}

/** Join requests to approve, the invite link to share, and who lives here. */
async function Residents() {
  const user = await requirePortal("manager");
  const { community } = user.staff;
  const { pending, members } = await communityResidents(community.id);
  const inviteUrl = `${getEnv().APP_URL.replace(/\/$/, "")}/join/${community.code}`;
  const now = new Date();
  const flat = (f: { tower: string; number: string }) => `${community.unitLabel} ${f.tower}-${f.number}`;

  return (
    <div className="space-y-6">
      <PageHeader title={t("approvals.residentsTitle")} subtitle={t("approvals.residentsIntro", { community: community.name })} />

      <section aria-labelledby="waiting">
        <SectionTitle>
          <span id="waiting">{t("approvals.pendingHeading")}</span>
        </SectionTitle>
        {pending.length === 0 ? (
          <EmptyState icon={<UserCheck aria-hidden className="size-6" />} title={t("approvals.noPending")} body={t("approvals.noPendingBody")} />
        ) : (
          <ul className="space-y-3">
            {pending.map((request) => {
              const name = request.user.name ?? formatPhone(request.user.phone);
              return (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
                  <span className="min-w-0">
                    <span className="block font-semibold text-fg">{name}</span>
                    <span className="block text-sm text-muted">
                      {flat(request.flat)} · {formatPhone(request.user.phone)}
                    </span>
                    <span className="block text-xs text-subtle">{t("approvals.requested", { when: relativeTime(request.createdAt, now) })}</span>
                  </span>
                  <DecisionButtons
                    action={decideJoinAction}
                    field={{ name: "requestId", value: request.id }}
                    labels={{
                      approve: t("approvals.approve"),
                      decline: t("approvals.decline"),
                      declineTitle: t("approvals.declineTitle", { name }),
                      noteLabel: t("approvals.noteLabel"),
                      notePlaceholder: t("approvals.notePlaceholder"),
                      confirmDecline: t("approvals.confirmDecline"),
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader title={t("approvals.inviteTitle")} subtitle={t("approvals.inviteBody")} />
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-fg">
          <Link2 aria-hidden className="size-4 text-brand" />
          {t("approvals.inviteCode", { code: community.code })}
        </p>
        <ShareRound whatsappHref={whatsappUrl(t("approvals.inviteMessage", { community: community.name, url: inviteUrl }))} inviteUrl={inviteUrl} />
      </Card>

      <section aria-labelledby="members">
        <SectionTitle>
          <span id="members">{t("approvals.membersHeading", { n: members.length })}</span>
        </SectionTitle>
        {members.length === 0 ? (
          <EmptyState icon={<Users aria-hidden className="size-6" />} title={t("approvals.noMembers")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <House aria-hidden className="size-4 shrink-0 text-muted" />
                <span className="w-20 shrink-0 font-medium text-fg tabular-nums">{m.flat ? `${m.flat.tower}-${m.flat.number}` : ""}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{m.name}</span>
                <ConfirmAction
                  action={removeResidentAction}
                  fields={{ userId: m.id }}
                  trigger={
                    <>
                      <UserMinus aria-hidden className="size-4" />
                      <span className="sr-only sm:not-sr-only">{t("team.removeResident")}</span>
                      <span className="sr-only">{` ${m.name ?? ""}`}</span>
                    </>
                  }
                  triggerVariant="ghost"
                  title={t("team.removeResidentTitle", { name: m.name ?? "" })}
                  body={t("team.removeResidentBody", { community: community.name })}
                  confirm={t("team.removeResidentConfirm")}
                  danger
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DecisionButtons } from "@/components/approvals/decision-buttons";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { relativeTime } from "@/lib/notifications";
import { formatPhone } from "@/lib/phone";
import { decideCommunityAction } from "@/server/actions/admin";
import { verificationQueues } from "@/server/registration";

export const metadata: Metadata = { title: t("approvals.communitiesTitle") };

export default function AdminCommunitiesPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Communities />
    </Suspense>
  );
}

/** Communities registered by Society Managers, waiting to go live. */
async function Communities() {
  await requirePortal("admin");
  const { communities } = await verificationQueues();
  const now = new Date();
  return (
    <>
      <PageHeader title={t("approvals.communitiesTitle")} subtitle={t("approvals.communitiesIntro")} />
      {communities.length === 0 ? (
        <EmptyState icon={<Building2 aria-hidden className="size-6" />} title={t("approvals.noCommunities")} />
      ) : (
        <ul className="space-y-3">
          {communities.map((c) => (
            <li key={c.id} className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-card">
              <div className="space-y-1">
                <p className="font-semibold text-fg">{c.name}</p>
                <p className="text-sm text-muted">
                  {t("approvals.communityMeta", { type: t(`register.community.types.${c.type}`), flats: c._count.flats, city: c.city, pincode: c.pincode })}
                </p>
                <p className="text-sm text-muted">{c.address}</p>
                {c.registeredBy && (
                  <p className="text-sm text-muted">{t("approvals.registeredBy", { name: c.registeredBy.name ?? "", phone: formatPhone(c.registeredBy.phone) })}</p>
                )}
                <p className="text-xs text-subtle">{t("approvals.requested", { when: relativeTime(c.createdAt, now) })}</p>
              </div>
              <DecisionButtons
                action={decideCommunityAction}
                field={{ name: "communityId", value: c.id }}
                labels={{
                  approve: t("approvals.approve"),
                  decline: t("approvals.decline"),
                  declineTitle: t("approvals.declineTitle", { name: c.name }),
                  noteLabel: t("approvals.declineNoteLabel"),
                  confirmDecline: t("approvals.confirmDecline"),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

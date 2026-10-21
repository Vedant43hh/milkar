import { Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DecisionButtons } from "@/components/approvals/decision-buttons";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { relativeTime } from "@/lib/notifications";
import { formatPhone } from "@/lib/phone";
import { decideVendorAction } from "@/server/actions/admin";
import { verificationQueues } from "@/server/registration";

export const metadata: Metadata = { title: t("approvals.vendorsTitle") };

export default function AdminVendorsPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Vendors />
    </Suspense>
  );
}

/** Vendors waiting for verification, with what they told us. */
async function Vendors() {
  await requirePortal("admin");
  const { vendors } = await verificationQueues();
  const now = new Date();
  return (
    <>
      <PageHeader title={t("approvals.vendorsTitle")} subtitle={t("approvals.vendorsIntro")} />
      {vendors.length === 0 ? (
        <EmptyState icon={<Store aria-hidden className="size-6" />} title={t("approvals.noVendors")} />
      ) : (
        <ul className="space-y-3">
          {vendors.map((v) => (
            <li key={v.id} className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-card">
              <div className="space-y-1">
                <p className="font-semibold text-fg">{v.name}</p>
                <p className="flex flex-wrap gap-1.5">
                  {v.categories.map((c) => (
                    <Badge key={c} tone="brand">
                      {t(`register.business.categoryNames.${c}`)}
                    </Badge>
                  ))}
                </p>
                <p className="text-sm text-muted">
                  {v.city} · {formatPhone(v.phone)}
                </p>
                <p className="text-sm text-muted">{v.serviceAreaPincodes.length > 0 ? t("approvals.vendorArea", { pincodes: v.serviceAreaPincodes.join(", ") }) : "—"}</p>
                <p className="text-sm text-muted">{v.gstin ? t("approvals.vendorGstin", { gstin: v.gstin }) : t("approvals.vendorNoGstin")}</p>
                <p className="text-sm text-muted">{t("approvals.catalogueCount", { n: v._count.products + v._count.services })}</p>
                <p className="text-xs text-subtle">{t("approvals.requested", { when: relativeTime(v.createdAt, now) })}</p>
              </div>
              <DecisionButtons
                action={decideVendorAction}
                field={{ name: "vendorId", value: v.id }}
                labels={{
                  approve: t("approvals.verify"),
                  decline: t("approvals.decline"),
                  declineTitle: t("approvals.declineTitle", { name: v.name }),
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

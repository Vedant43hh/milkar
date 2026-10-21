import { Ban, Building2, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortalUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: t("managerPending.title") };

export default function ManagerPendingPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={1} />}>
      <Pending />
    </Suspense>
  );
}

/** Where a Society Manager waits until a platform admin approves the community they registered. */
async function Pending() {
  const user = await requirePortalUser("manager");
  const community = user.staff?.community;
  if (community?.status === "APPROVED") redirect("/manager");
  const note = community?.status === "REJECTED" ? (await prisma.community.findUnique({ where: { id: community.id }, select: { reviewNote: true } }))?.reviewNote : null;

  return (
    <>
      <PageHeader title={t("managerPending.title")} />
      {!community ? (
        <EmptyState icon={<Building2 aria-hidden className="size-6" />} title={t("managerPending.noneTitle")} body={t("managerPending.noneBody")} />
      ) : community.status === "PENDING" ? (
        <EmptyState
          icon={<Hourglass aria-hidden className="size-6" />}
          title={t("managerPending.pendingTitle")}
          body={t("managerPending.pendingBody", { community: community.name })}
        />
      ) : (
        <EmptyState
          icon={<Ban aria-hidden className="size-6" />}
          title={t("managerPending.rejectedTitle")}
          body={`${t("managerPending.rejectedBody", { community: community.name })}${note ? ` ${t("managerPending.rejectedNote", { note })}` : ""}`}
        />
      )}
    </>
  );
}

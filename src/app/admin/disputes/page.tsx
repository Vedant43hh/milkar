import { MessageSquareWarning } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { IssueCard } from "@/components/issues/issue-card";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { resolveDisputeAction } from "@/server/actions/admin";
import { listDisputes } from "@/server/admin";

export const metadata: Metadata = { title: t("adminDisputes.title") };

export default function DisputesPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Disputes />
    </Suspense>
  );
}

async function Disputes() {
  await requirePortal("admin");
  const now = new Date();
  const disputes = await listDisputes(now);
  return (
    <div>
      <PageHeader title={t("adminDisputes.title")} subtitle={t("adminDisputes.intro")} />
      {disputes.length === 0 ? (
        <EmptyState icon={<MessageSquareWarning aria-hidden className="size-6" />} title={t("adminDisputes.none")} body={t("adminDisputes.noneBody")} />
      ) : (
        <ul className="space-y-3">
          {disputes.map((issue) => (
            <IssueCard key={issue.id} issue={issue} now={now} action={resolveDisputeAction} showCommunity />
          ))}
        </ul>
      )}
    </div>
  );
}

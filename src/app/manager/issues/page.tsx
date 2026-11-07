import { MessageSquareWarning } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { IssueCard } from "@/components/issues/issue-card";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { resolveIssueAction } from "@/server/actions/manager";
import { listCommunityIssues, type CommunityIssue } from "@/server/issues";

export const metadata: Metadata = { title: t("issues.title") };

export default function IssuesPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Issues />
    </Suspense>
  );
}

/** Complaints about visits: the ones to sort out first. */
async function Issues() {
  const user = await requirePortal("manager");
  const now = new Date();
  const { community } = user.staff;
  const issues = await listCommunityIssues(community.id);
  const open = issues.filter((i) => i.options.length > 0);
  const closed = issues.filter((i) => i.options.length === 0);
  const section = (id: string, title: string, list: CommunityIssue[]) =>
    list.length > 0 && (
      <section aria-labelledby={id}>
        <SectionTitle>
          <span id={id}>{title}</span>
        </SectionTitle>
        <ul className="space-y-3">
          {list.map((issue) => (
            <IssueCard key={issue.id} issue={issue} now={now} action={resolveIssueAction} />
          ))}
        </ul>
      </section>
    );

  return (
    <div>
      <PageHeader title={t("issues.title")} subtitle={t("issues.intro")} />
      {issues.length === 0 ? (
        <EmptyState icon={<MessageSquareWarning aria-hidden className="size-6" />} title={t("issues.none")} body={t("issues.noneBody")} />
      ) : (
        <>
          {section("to-sort-out", t("issues.sectionOpen"), open)}
          {section("sorted", t("issues.sectionClosed"), closed)}
        </>
      )}
    </div>
  );
}

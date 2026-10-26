import { Ban, CalendarPlus, MessageSquareWarning, Undo2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/manager/confirm-action";
import { Badge, type Tone } from "@/components/ui/badge";
import { PageHeader, SectionTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { PageSkeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { requirePortal } from "@/lib/auth/current-user";
import { relativeTime } from "@/lib/notifications";
import { formatIST, startOfIstDay, utcToIstLocal } from "@/lib/time";
import { resolveIssueAction } from "@/server/actions/manager";
import { listCommunityIssues, type CommunityIssue } from "@/server/issues";

export const metadata: Metadata = { title: t("issues.title") };

const TONE: Record<string, Tone> = { OPEN: "warning", REVISIT_SCHEDULED: "accent", REFUNDED: "success", REJECTED: "neutral", RESOLVED: "success" };

export default function IssuesPage() {
  return (
    <Suspense fallback={<PageSkeleton cards={2} />}>
      <Issues />
    </Suspense>
  );
}

function IssueCard({ issue, unitLabel, now }: { issue: CommunityIssue; unitLabel: string; now: Date }) {
  const flat = `${unitLabel} ${issue.flat.tower}-${issue.flat.number}`;
  const service = issue.round.service?.name ?? issue.round.title;
  const dispute = issue.kind === "NO_ACCESS_DISPUTE";
  // Tomorrow, 10 am IST: a sensible first suggestion for a revisit.
  const suggested = utcToIstLocal(new Date(startOfIstDay(now, 1).getTime() + 10 * 3_600_000));
  return (
    <li className="space-y-2 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-fg">
            {flat} · {service}
          </h2>
          <p className="text-sm text-muted">{t(`issues.kind.${issue.kind}`)}</p>
        </div>
        <Badge tone={TONE[issue.status]}>{t(`issues.status.${issue.status}`)}</Badge>
      </div>
      <p className="text-sm text-fg">“{issue.note}”</p>
      <p className="text-xs text-muted">{t("issues.reported", { name: issue.reportedBy.name ?? "", when: relativeTime(issue.createdAt, now) })}</p>
      <p className="text-xs text-muted">{t("issues.visit", { when: formatIST(issue.visit.startsAt), technician: issue.visit.technicianName ?? "" })}</p>
      {issue.visit.revisit && (
        <p className="text-xs text-muted">{t("issues.revisitOn", { when: formatIST(issue.visit.revisit.startsAt), status: t(`visitStatus.${issue.visit.revisit.status}`) })}</p>
      )}
      {issue.resolution && <p className="text-sm text-muted">{t("issues.resolution", { text: issue.resolution })}</p>}
      {issue.options.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {issue.options.includes("REVISIT") && (
            <ConfirmAction
              action={resolveIssueAction}
              fields={{ issueId: issue.id, resolution: "REVISIT" }}
              trigger={
                <>
                  <CalendarPlus aria-hidden className="size-4" />
                  {t("issues.revisit")}
                  <span className="sr-only"> {flat}</span>
                </>
              }
              triggerVariant="primary"
              title={t("issues.revisitTitle")}
              body={t("issues.revisitBody")}
              confirm={t("issues.revisitConfirm")}
            >
              <Field id={`revisit-${issue.id}`} label={t("issues.revisitAt")}>
                {(aria) => <Input {...aria} type="datetime-local" name="revisitAt" required defaultValue={suggested} />}
              </Field>
            </ConfirmAction>
          )}
          {issue.options.includes("REFUND") && (
            <ConfirmAction
              action={resolveIssueAction}
              fields={{ issueId: issue.id, resolution: "REFUND" }}
              trigger={
                <>
                  <Undo2 aria-hidden className="size-4" />
                  {t("issues.refund")}
                  <span className="sr-only"> {flat}</span>
                </>
              }
              title={t(dispute ? "issues.refundFeeTitle" : "issues.refundTitle")}
              body={t(dispute ? "issues.refundFeeBody" : "issues.refundBody")}
              confirm={t("issues.refundConfirm")}
            />
          )}
          {issue.options.includes("REJECT") && (
            <ConfirmAction
              action={resolveIssueAction}
              fields={{ issueId: issue.id, resolution: "REJECT" }}
              trigger={
                <>
                  <Ban aria-hidden className="size-4" />
                  {t("issues.reject")}
                  <span className="sr-only"> {flat}</span>
                </>
              }
              triggerVariant="ghost"
              title={t("issues.rejectTitle")}
              confirm={t("issues.rejectConfirm")}
              danger
            >
              <Field id={`reject-${issue.id}`} label={t("issues.rejectNote")}>
                {(aria) => <Textarea {...aria} name="note" rows={3} required minLength={3} maxLength={300} />}
              </Field>
            </ConfirmAction>
          )}
        </div>
      )}
    </li>
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
            <IssueCard key={issue.id} issue={issue} unitLabel={community.unitLabel} now={now} />
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

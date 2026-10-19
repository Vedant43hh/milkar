// Reporting and resolving problems with a service visit. Pure: callers pass `now`.
//
// Within 48 hours of a visit, the resident can report that the job was not done properly (after
// COMPLETED) or dispute a no-access visit fee (after NO_ACCESS). A "not done properly" issue is
// resolved by ONE free revisit or by a wallet refund, never both for the same complaint. If the
// revisit also falls short, the resident reports on the revisit and only a refund remains.

export const ISSUE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type IssueKind = "NOT_DONE_PROPERLY" | "NO_ACCESS_DISPUTE";
export type IssueStatus = "OPEN" | "REVISIT_SCHEDULED" | "REFUNDED" | "REJECTED" | "RESOLVED";
export type Resolution = "REVISIT" | "REFUND" | "REJECT";

export function issueDeadline(visitEndedAt: Date): Date {
  return new Date(visitEndedAt.getTime() + ISSUE_WINDOW_MS);
}

/** Open from the moment the visit ended until 48 hours later (exclusive). */
export function issueWindowOpen(visitEndedAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - visitEndedAt.getTime();
  return elapsed >= 0 && elapsed < ISSUE_WINDOW_MS;
}

export type ReportCheck = {
  visit: {
    status: string;
    completedAt: Date | null;
    noAccessAt: Date | null;
  };
  hasIssue: boolean;
  now: Date;
};

export type ReportResult =
  | { ok: true; kind: IssueKind; deadline: Date }
  | { ok: false; error: "NOT_REPORTABLE" | "WINDOW_CLOSED" | "ALREADY_REPORTED" };

export function checkReport({ visit, hasIssue, now }: ReportCheck): ReportResult {
  const ended = visit.status === "COMPLETED" ? visit.completedAt : visit.status === "NO_ACCESS" ? visit.noAccessAt : null;
  if (!ended) return { ok: false, error: "NOT_REPORTABLE" };
  if (hasIssue) return { ok: false, error: "ALREADY_REPORTED" };
  if (!issueWindowOpen(ended, now)) return { ok: false, error: "WINDOW_CLOSED" };
  return { ok: true, kind: visit.status === "COMPLETED" ? "NOT_DONE_PROPERLY" : "NO_ACCESS_DISPUTE", deadline: issueDeadline(ended) };
}

export type ResolutionInput = {
  issue: { kind: IssueKind; status: IssueStatus };
  visit: { kind: "STANDARD" | "REVISIT" };
  /** Whether this visit already has its one free revisit. */
  hasRevisit: boolean;
};

/** What may still be done about an issue. */
export function resolutionOptions({ issue, visit, hasRevisit }: ResolutionInput): Resolution[] {
  if (issue.status !== "OPEN") return [];
  if (issue.kind === "NO_ACCESS_DISPUTE") return ["REFUND", "REJECT"]; // refund = give the visit fee back
  const options: Resolution[] = [];
  if (visit.kind === "STANDARD" && !hasRevisit) options.push("REVISIT");
  options.push("REFUND", "REJECT");
  return options;
}

const RESULT_STATUS: Record<Resolution, IssueStatus> = {
  REVISIT: "REVISIT_SCHEDULED",
  REFUND: "REFUNDED",
  REJECT: "REJECTED",
};

export function resolveIssue(input: ResolutionInput, resolution: Resolution): { ok: true; status: IssueStatus } | { ok: false; error: "NOT_ALLOWED" } {
  return resolutionOptions(input).includes(resolution) ? { ok: true, status: RESULT_STATUS[resolution] } : { ok: false, error: "NOT_ALLOWED" };
}

export const serviceIssueRefundKey = (orderItemId: string, cumulativeQty: number) => `SERVICE_ISSUE_REFUND:${orderItemId}:${cumulativeQty}`;
export const noAccessFeeRefundKey = (issueId: string, orderItemId: string) => `SERVICE_ISSUE_REFUND:fee:${issueId}:${orderItemId}`;

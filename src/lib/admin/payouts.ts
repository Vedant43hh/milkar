// When Milkar can pay a vendor for a round. Pure.
//
// Groceries: once every bag is handed out (short or damaged goods are reported at the handover).
// Service Days: once every visit is finished, no complaint is waiting, and the 48 hours residents
// have to complain after the last visit have passed. Paying earlier would leave refunds that the
// vendor's payout should have covered.

import { ISSUE_WINDOW_MS } from "../services/issues";

export type NotReady = "CANCELLED" | "NOT_HANDED_OUT" | "VISITS_TO_DO" | "COMPLAINT_OPEN" | "COMPLAINT_WINDOW";

export type PayoutRound = {
  kind: "GROCERY" | "SERVICE";
  status: "OPEN" | "FINALIZING" | "FINALIZED" | "COMPLETED" | "CANCELLED";
  /** `endedAt`: when the job was finished or found no one home (complaints run 48 hours from then). */
  visits: readonly { status: string; endedAt: Date | null }[];
  openIssues: number;
};

const FINAL_VISIT = ["COMPLETED", "NO_ACCESS", "CANCELLED"];

/** Why the round can't be paid yet, or null when it can. */
export function payoutBlocker(round: PayoutRound, now: Date): NotReady | null {
  if (round.status === "CANCELLED") return "CANCELLED";
  if (round.kind === "GROCERY") return round.status === "COMPLETED" ? null : "NOT_HANDED_OUT";
  if (round.status !== "FINALIZED" && round.status !== "COMPLETED") return "VISITS_TO_DO";
  if (round.visits.some((v) => !FINAL_VISIT.includes(v.status))) return "VISITS_TO_DO";
  if (round.openIssues > 0) return "COMPLAINT_OPEN";
  const lastEnd = Math.max(0, ...round.visits.map((v) => v.endedAt?.getTime() ?? 0));
  if (now.getTime() - lastEnd < ISSUE_WINDOW_MS) return "COMPLAINT_WINDOW";
  return null;
}

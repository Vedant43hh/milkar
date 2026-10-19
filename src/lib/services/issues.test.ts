import { describe, expect, it } from "vitest";
import { checkReport, issueDeadline, issueWindowOpen, resolutionOptions, resolveIssue, type ResolutionInput } from "./issues";

const completedAt = new Date("2026-10-24T08:00:00Z");
const after = (h: number, m = 0) => new Date(completedAt.getTime() + (h * 60 + m) * 60_000);

describe("48-hour issue window", () => {
  it("accepts a report at 47:59 and rejects one at 48:00", () => {
    expect(issueWindowOpen(completedAt, after(47, 59))).toBe(true);
    expect(issueWindowOpen(completedAt, after(48, 0))).toBe(false);
    expect(issueDeadline(completedAt)).toEqual(after(48));
  });

  it("is not open before the visit ended", () => {
    expect(issueWindowOpen(completedAt, after(0, -1))).toBe(false);
  });
});

describe("checkReport", () => {
  const completed = { status: "COMPLETED", completedAt, noAccessAt: null };

  it("allows 'not done properly' after a completed visit", () => {
    expect(checkReport({ visit: completed, hasIssue: false, now: after(47, 59) })).toEqual({
      ok: true,
      kind: "NOT_DONE_PROPERLY",
      deadline: after(48),
    });
  });

  it("allows disputing a no-access fee, timed from when no-access was marked", () => {
    const noAccess = { status: "NO_ACCESS", completedAt: null, noAccessAt: completedAt };
    expect(checkReport({ visit: noAccess, hasIssue: false, now: after(1) })).toMatchObject({ ok: true, kind: "NO_ACCESS_DISPUTE" });
  });

  it("rejects late, repeated and premature reports", () => {
    expect(checkReport({ visit: completed, hasIssue: false, now: after(48) })).toEqual({ ok: false, error: "WINDOW_CLOSED" });
    expect(checkReport({ visit: completed, hasIssue: true, now: after(1) })).toEqual({ ok: false, error: "ALREADY_REPORTED" });
    expect(checkReport({ visit: { status: "SCHEDULED", completedAt: null, noAccessAt: null }, hasIssue: false, now: after(1) })).toEqual({
      ok: false,
      error: "NOT_REPORTABLE",
    });
  });
});

describe("revisit or refund", () => {
  const open = (overrides: Partial<ResolutionInput> = {}): ResolutionInput => ({
    issue: { kind: "NOT_DONE_PROPERLY", status: "OPEN" },
    visit: { kind: "STANDARD" },
    hasRevisit: false,
    ...overrides,
  });

  it("offers one free revisit or a refund for the original visit", () => {
    expect(resolutionOptions(open())).toEqual(["REVISIT", "REFUND", "REJECT"]);
  });

  it("never gives both: once a revisit is scheduled, that complaint is closed to refunds", () => {
    const revisit = resolveIssue(open(), "REVISIT");
    expect(revisit).toEqual({ ok: true, status: "REVISIT_SCHEDULED" });
    const scheduled = open({ issue: { kind: "NOT_DONE_PROPERLY", status: "REVISIT_SCHEDULED" }, hasRevisit: true });
    expect(resolutionOptions(scheduled)).toEqual([]);
    expect(resolveIssue(scheduled, "REFUND")).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });

  it("and once refunded, no revisit can follow", () => {
    expect(resolveIssue(open(), "REFUND")).toEqual({ ok: true, status: "REFUNDED" });
    expect(resolutionOptions(open({ issue: { kind: "NOT_DONE_PROPERLY", status: "REFUNDED" } }))).toEqual([]);
  });

  it("after a failed revisit, only a refund remains (no second free revisit)", () => {
    const onRevisit = open({ visit: { kind: "REVISIT" } });
    expect(resolutionOptions(onRevisit)).toEqual(["REFUND", "REJECT"]);
    expect(resolveIssue(onRevisit, "REVISIT")).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(resolutionOptions(open({ hasRevisit: true }))).toEqual(["REFUND", "REJECT"]);
  });

  it("resolves a no-access dispute by refunding the fee or rejecting it", () => {
    expect(resolutionOptions(open({ issue: { kind: "NO_ACCESS_DISPUTE", status: "OPEN" } }))).toEqual(["REFUND", "REJECT"]);
  });
});

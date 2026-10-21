import { describe, expect, it } from "vitest";
import {
  canTransition,
  formatCompletionCode,
  isFinal,
  MAX_CODE_ATTEMPTS,
  transitionVisit,
  VISIT_TRANSITIONS,
  type VisitStatus,
} from "./visit";

const now = new Date("2026-10-24T05:00:00Z");
const ALL: VisitStatus[] = ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS", "COMPLETED", "NO_ACCESS", "CANCELLED"];
const visit = (status: VisitStatus, codeAttempts = 0) => ({ status, completionCode: "4821", codeAttempts });

describe("visit transitions", () => {
  it.each([
    ["SCHEDULED", "ON_THE_WAY", "onTheWayAt", "NONE"],
    ["SCHEDULED", "CANCELLED", "cancelledAt", "FULL_REFUND"],
    ["ON_THE_WAY", "IN_PROGRESS", "startedAt", "NONE"],
    ["ON_THE_WAY", "NO_ACCESS", "noAccessAt", "NO_ACCESS_REFUND"],
    ["ON_THE_WAY", "CANCELLED", "cancelledAt", "FULL_REFUND"],
    ["IN_PROGRESS", "COMPLETED", "completedAt", "NONE"],
  ] as const)("%s → %s is allowed for the vendor", (from, to, stamp, money) => {
    const result = transitionVisit(visit(from), { to, actor: "VENDOR", now, code: "4821" });
    expect(result).toEqual({ ok: true, status: to, stamp, money });
  });

  it("lists exactly six valid transitions; everything else is rejected", () => {
    const valid = ALL.flatMap((from) => ALL.filter((to) => canTransition(from, to)).map((to) => `${from}→${to}`));
    expect(valid).toHaveLength(6);
    expect(valid).toEqual(Object.entries(VISIT_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}→${to}`)));
  });

  it.each([
    ["SCHEDULED", "IN_PROGRESS"], // must be on the way first
    ["SCHEDULED", "COMPLETED"],
    ["SCHEDULED", "NO_ACCESS"],
    ["IN_PROGRESS", "NO_ACCESS"], // already inside the flat
    ["IN_PROGRESS", "CANCELLED"],
    ["COMPLETED", "CANCELLED"],
    ["NO_ACCESS", "IN_PROGRESS"],
    ["CANCELLED", "ON_THE_WAY"],
  ] as const)("%s → %s is rejected", (from, to) => {
    expect(transitionVisit(visit(from), { to, actor: "VENDOR", now, code: "4821" })).toEqual({ ok: false, error: "INVALID_TRANSITION" });
  });

  it("treats completed, no-access and cancelled visits as final", () => {
    expect(ALL.filter(isFinal)).toEqual(["COMPLETED", "NO_ACCESS", "CANCELLED"]);
  });

  it("lets managers and admins cancel but not run the visit", () => {
    expect(transitionVisit(visit("SCHEDULED"), { to: "CANCELLED", actor: "MANAGER", now }).ok).toBe(true);
    expect(transitionVisit(visit("ON_THE_WAY"), { to: "CANCELLED", actor: "ADMIN", now }).ok).toBe(true);
    expect(transitionVisit(visit("SCHEDULED"), { to: "ON_THE_WAY", actor: "MANAGER", now })).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(transitionVisit(visit("ON_THE_WAY"), { to: "NO_ACCESS", actor: "MANAGER", now })).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });
});

describe("completion code", () => {
  it("is required and must match", () => {
    expect(transitionVisit(visit("IN_PROGRESS"), { to: "COMPLETED", actor: "VENDOR", now })).toEqual({ ok: false, error: "CODE_REQUIRED" });
    expect(transitionVisit(visit("IN_PROGRESS", 1), { to: "COMPLETED", actor: "VENDOR", now, code: "1234" })).toEqual({
      ok: false,
      error: "WRONG_CODE",
      codeAttempts: 2,
      attemptsLeft: 3,
    });
    expect(transitionVisit(visit("IN_PROGRESS"), { to: "COMPLETED", actor: "VENDOR", now, code: " 4821 " }).ok).toBe(true);
  });

  it("locks the vendor out after 5 wrong codes, even with the right one", () => {
    let attempts = 0;
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      const result = transitionVisit(visit("IN_PROGRESS", attempts), { to: "COMPLETED", actor: "VENDOR", now, code: "0000" });
      expect(result.ok).toBe(false);
      if (!result.ok && result.error === "WRONG_CODE") attempts = result.codeAttempts;
    }
    expect(attempts).toBe(5);
    expect(transitionVisit(visit("IN_PROGRESS", attempts), { to: "COMPLETED", actor: "VENDOR", now, code: "4821" })).toEqual({
      ok: false,
      error: "CODE_LOCKED",
    });
  });

  it("lets a manager confirm completion only once the code is locked", () => {
    expect(transitionVisit(visit("IN_PROGRESS", 4), { to: "COMPLETED", actor: "MANAGER", now })).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(transitionVisit(visit("IN_PROGRESS", 5), { to: "COMPLETED", actor: "MANAGER", now }).ok).toBe(true);
  });

  it("formats 4 digits with leading zeros", () => {
    expect(formatCompletionCode(7)).toBe("0007");
    expect(formatCompletionCode(9999)).toBe("9999");
    expect(() => formatCompletionCode(10000)).toThrow();
  });
});

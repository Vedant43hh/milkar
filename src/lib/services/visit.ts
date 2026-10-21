// Service visit lifecycle. Pure: callers pass `now` and persist the result.
//
//   SCHEDULED ──► ON_THE_WAY ──► IN_PROGRESS ──► COMPLETED (needs the resident's 4-digit code)
//       │              ├──► NO_ACCESS (refund minus the visit fee)
//       └──────────────┴──► CANCELLED (full refund)

export type VisitStatus = "SCHEDULED" | "ON_THE_WAY" | "IN_PROGRESS" | "COMPLETED" | "NO_ACCESS" | "CANCELLED";
export type VisitActor = "VENDOR" | "MANAGER" | "ADMIN";

export const MAX_CODE_ATTEMPTS = 5;

export const VISIT_TRANSITIONS: Record<VisitStatus, readonly VisitStatus[]> = {
  SCHEDULED: ["ON_THE_WAY", "CANCELLED"],
  ON_THE_WAY: ["IN_PROGRESS", "NO_ACCESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  NO_ACCESS: [],
  CANCELLED: [],
};

/** The vendor runs the visit; managers and admins can only cancel, or confirm a code-locked visit. */
const ACTORS: Record<Exclude<VisitStatus, "SCHEDULED">, readonly VisitActor[]> = {
  ON_THE_WAY: ["VENDOR"],
  IN_PROGRESS: ["VENDOR"],
  COMPLETED: ["VENDOR", "MANAGER", "ADMIN"],
  NO_ACCESS: ["VENDOR"],
  CANCELLED: ["VENDOR", "MANAGER", "ADMIN"],
};

export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return VISIT_TRANSITIONS[from].includes(to);
}

export function isFinal(status: VisitStatus): boolean {
  return VISIT_TRANSITIONS[status].length === 0;
}

export type VisitState = {
  status: VisitStatus;
  completionCode: string;
  codeAttempts: number;
};

export type VisitTransition = {
  to: Exclude<VisitStatus, "SCHEDULED">;
  actor: VisitActor;
  now: Date;
  /** The code the resident read out; required for the vendor to complete. */
  code?: string;
};

export type MoneyEffect = "NONE" | "NO_ACCESS_REFUND" | "FULL_REFUND";

const TIMESTAMP: Record<VisitTransition["to"], "onTheWayAt" | "startedAt" | "completedAt" | "noAccessAt" | "cancelledAt"> = {
  ON_THE_WAY: "onTheWayAt",
  IN_PROGRESS: "startedAt",
  COMPLETED: "completedAt",
  NO_ACCESS: "noAccessAt",
  CANCELLED: "cancelledAt",
};

export type TransitionResult =
  | {
      ok: true;
      status: VisitTransition["to"];
      /** Field to stamp with `now`. */
      stamp: (typeof TIMESTAMP)[VisitTransition["to"]];
      money: MoneyEffect;
    }
  | { ok: false; error: "INVALID_TRANSITION" | "NOT_ALLOWED" | "CODE_REQUIRED" | "CODE_LOCKED" }
  | { ok: false; error: "WRONG_CODE"; codeAttempts: number; attemptsLeft: number };

export function isCodeLocked(visit: Pick<VisitState, "codeAttempts">): boolean {
  return visit.codeAttempts >= MAX_CODE_ATTEMPTS;
}

/**
 * Decides one lifecycle step. A wrong completion code returns the new attempt count to persist;
 * after 5 wrong codes the vendor is locked out and a manager or admin confirms completion instead.
 */
export function transitionVisit(visit: VisitState, t: VisitTransition): TransitionResult {
  if (!canTransition(visit.status, t.to)) return { ok: false, error: "INVALID_TRANSITION" };
  if (!ACTORS[t.to].includes(t.actor)) return { ok: false, error: "NOT_ALLOWED" };

  if (t.to === "COMPLETED") {
    if (t.actor === "VENDOR") {
      if (isCodeLocked(visit)) return { ok: false, error: "CODE_LOCKED" };
      if (!t.code) return { ok: false, error: "CODE_REQUIRED" };
      if (t.code.trim() !== visit.completionCode) {
        const codeAttempts = visit.codeAttempts + 1;
        return { ok: false, error: "WRONG_CODE", codeAttempts, attemptsLeft: Math.max(MAX_CODE_ATTEMPTS - codeAttempts, 0) };
      }
    } else if (!isCodeLocked(visit)) {
      // Staff may only step in once the code is locked; normally the resident's code is the proof.
      return { ok: false, error: "NOT_ALLOWED" };
    }
  }

  const money: MoneyEffect = t.to === "NO_ACCESS" ? "NO_ACCESS_REFUND" : t.to === "CANCELLED" ? "FULL_REFUND" : "NONE";
  return { ok: true, status: t.to, stamp: TIMESTAMP[t.to], money };
}

/** A 4-digit completion code from a random integer in [0, 10000) (crypto.randomInt on the server). */
export function formatCompletionCode(random: number): string {
  if (!Number.isInteger(random) || random < 0 || random > 9999) throw new RangeError("random must be 0–9999");
  return String(random).padStart(4, "0");
}

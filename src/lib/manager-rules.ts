// Rules for running a community day to day. Pure: callers pass `now`.

export type StaffKind = "PRIMARY" | "ASSISTANT";

/** Only the primary Society Manager runs the team and the community's settings; assistants do everything else. */
export function canManageTeam(kind: StaffKind | null | undefined): boolean {
  return kind === "PRIMARY";
}

// ---------- distribution day ----------

export type PickupState = "PENDING" | "COLLECTED";

/** How far distribution has got; the round is done once every flat has collected. */
export function distributionProgress(pickups: readonly { status: PickupState }[]): { collected: number; total: number; done: boolean } {
  const collected = pickups.filter((p) => p.status === "COLLECTED").length;
  return { collected, total: pickups.length, done: pickups.length > 0 && collected === pickups.length };
}

/** The code the resident shows, as typed: spaces ignored. */
export function pickupCodeMatches(expected: string, typed: string): boolean {
  return typed.replace(/\s+/g, "") === expected;
}

export type DeliveryIssueError = "CANNOT_DECREASE" | "TOO_MANY" | "INVALID_QUANTITY";

/**
 * Short and damaged units for one item at distribution. Counts are cumulative and can only grow,
 * so recording the same numbers twice refunds nothing; together they can't exceed what was bought.
 */
export function checkDeliveryIssue(input: { quantity: number; prevShort: number; prevDamaged: number; short: number; damaged: number }): DeliveryIssueError | null {
  const { quantity, prevShort, prevDamaged, short, damaged } = input;
  if (![short, damaged].every((n) => Number.isInteger(n) && n >= 0)) return "INVALID_QUANTITY";
  if (short < prevShort || damaged < prevDamaged) return "CANNOT_DECREASE";
  if (short + damaged > quantity) return "TOO_MANY";
  return null;
}

// ---------- free revisits ----------

export const REVISIT_MIN_LEAD_MS = 60 * 60 * 1000;
export const REVISIT_MAX_DAYS = 14;

/** A free revisit must be booked at least an hour ahead and within two weeks. */
export function checkRevisitTime(startsAt: Date, now: Date): "TOO_SOON" | "TOO_FAR" | null {
  const lead = startsAt.getTime() - now.getTime();
  if (Number.isNaN(lead) || lead < REVISIT_MIN_LEAD_MS) return "TOO_SOON";
  if (lead > REVISIT_MAX_DAYS * 24 * 60 * 60 * 1000) return "TOO_FAR";
  return null;
}

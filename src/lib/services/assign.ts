// Which technician takes which visit when a Service Day is confirmed. Pure.
//
// Round-robin inside each time slot, so the visits in one slot go to different people, and each
// slot starts one technician further along, so the day's work spreads evenly. The vendor can
// reassign later.

export type AssignableVisit = { id: string; startsAt: Date };

export function assignTechnicians(visits: readonly AssignableVisit[], technicianIds: readonly string[]): Map<string, string | null> {
  const assignment = new Map<string, string | null>();
  if (technicianIds.length === 0) {
    for (const v of visits) assignment.set(v.id, null);
    return assignment;
  }
  const slots = [...new Set(visits.map((v) => v.startsAt.getTime()))].sort((a, b) => a - b);
  for (const [slotIndex, start] of slots.entries()) {
    const inSlot = visits.filter((v) => v.startsAt.getTime() === start);
    inSlot.forEach((v, i) => assignment.set(v.id, technicianIds[(slotIndex + i) % technicianIds.length]));
  }
  return assignment;
}

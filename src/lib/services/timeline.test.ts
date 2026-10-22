import { describe, expect, it } from "vitest";
import { visitTimeline, type TimelineVisit } from "./timeline";

const at = (h: number) => new Date(Date.UTC(2026, 9, 21, h));
const scheduled: TimelineVisit = { status: "SCHEDULED", createdAt: at(1), onTheWayAt: null, startedAt: null, completedAt: null, noAccessAt: null, cancelledAt: null };

describe("visitTimeline", () => {
  it("shows a booked visit with the rest ahead", () => {
    expect(visitTimeline(scheduled).map((s) => [s.key, s.state])).toEqual([
      ["SCHEDULED", "current"],
      ["ON_THE_WAY", "upcoming"],
      ["IN_PROGRESS", "upcoming"],
      ["COMPLETED", "upcoming"],
    ]);
  });

  it("marks the steps passed with their times while the technician works", () => {
    const steps = visitTimeline({ ...scheduled, status: "IN_PROGRESS", onTheWayAt: at(4), startedAt: at(5) });
    expect(steps.map((s) => [s.key, s.state, s.at])).toEqual([
      ["SCHEDULED", "done", at(1)],
      ["ON_THE_WAY", "done", at(4)],
      ["IN_PROGRESS", "current", at(5)],
      ["COMPLETED", "upcoming", null],
    ]);
  });

  it("is all done once the job is finished", () => {
    const steps = visitTimeline({ ...scheduled, status: "COMPLETED", onTheWayAt: at(4), startedAt: at(5), completedAt: at(6) });
    expect(steps.every((s) => s.state === "done" && !s.problem)).toBe(true);
    expect(steps.at(-1)).toMatchObject({ key: "COMPLETED", at: at(6) });
  });

  it("ends with the problem when the technician couldn't get in", () => {
    const steps = visitTimeline({ ...scheduled, status: "NO_ACCESS", onTheWayAt: at(4), noAccessAt: at(5) });
    expect(steps.map((s) => [s.key, s.problem])).toEqual([
      ["SCHEDULED", false],
      ["ON_THE_WAY", false],
      ["NO_ACCESS", true],
    ]);
  });

  it("ends with the cancellation for a cancelled visit", () => {
    const steps = visitTimeline({ ...scheduled, status: "CANCELLED", cancelledAt: at(2) });
    expect(steps.map((s) => s.key)).toEqual(["SCHEDULED", "CANCELLED"]);
    expect(steps[1]).toMatchObject({ at: at(2), problem: true, state: "done" });
  });
});

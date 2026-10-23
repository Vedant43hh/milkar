import { describe, expect, it } from "vitest";
import { assignTechnicians } from "./assign";

const at = (h: number) => new Date(Date.UTC(2026, 9, 25, h));

describe("assignTechnicians", () => {
  it("gives the visits in one slot to different technicians", () => {
    const visits = [
      { id: "a", startsAt: at(4) },
      { id: "b", startsAt: at(4) },
      { id: "c", startsAt: at(4) },
    ];
    expect([...assignTechnicians(visits, ["t1", "t2", "t3"]).values()]).toEqual(["t1", "t2", "t3"]);
  });

  it("starts each slot one technician further along, so the day evens out", () => {
    const visits = [
      { id: "a", startsAt: at(4) },
      { id: "b", startsAt: at(6) },
      { id: "c", startsAt: at(8) },
      { id: "d", startsAt: at(8) },
    ];
    const result = assignTechnicians(visits, ["t1", "t2"]);
    expect(Object.fromEntries(result)).toEqual({ a: "t1", b: "t2", c: "t1", d: "t2" });
  });

  it("goes round again when a slot has more visits than technicians", () => {
    const visits = ["a", "b", "c"].map((id) => ({ id, startsAt: at(4) }));
    expect(Object.fromEntries(assignTechnicians(visits, ["t1", "t2"]))).toEqual({ a: "t1", b: "t2", c: "t1" });
  });

  it("leaves visits unassigned when the vendor has no technicians yet", () => {
    expect(Object.fromEntries(assignTechnicians([{ id: "a", startsAt: at(4) }], []))).toEqual({ a: null });
  });
});

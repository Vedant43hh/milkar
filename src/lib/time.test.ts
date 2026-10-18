import { describe, expect, it } from "vitest";
import { formatIST, istLocalToUtc, startOfIstDay, startOfIstMonth, utcToIstLocal } from "./time";

describe("IST conversion", () => {
  it("converts IST wall-clock input to UTC", () => {
    expect(istLocalToUtc("2026-10-23T20:00").toISOString()).toBe("2026-10-23T14:30:00.000Z");
    expect(istLocalToUtc("2026-10-24T03:00").toISOString()).toBe("2026-10-23T21:30:00.000Z");
  });

  it("round-trips UTC instants back to IST input values", () => {
    expect(utcToIstLocal(new Date("2026-10-23T14:30:00Z"))).toBe("2026-10-23T20:00");
    expect(utcToIstLocal(istLocalToUtc("2027-01-01T00:05"))).toBe("2027-01-01T00:05");
  });

  it("rejects impossible dates", () => {
    expect(() => istLocalToUtc("2026-02-30T10:00")).toThrow();
    expect(() => istLocalToUtc("2026-10-23 20:00")).toThrow();
    expect(() => istLocalToUtc("2026-10-23T24:00")).toThrow();
  });

  it("finds the start of the IST month and day", () => {
    // 31 Oct 20:00 UTC is already 1 Nov 01:30 in India.
    const now = new Date("2026-10-31T20:00:00Z");
    expect(startOfIstMonth(now).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(startOfIstDay(now).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(startOfIstDay(now, -1).toISOString()).toBe("2026-10-30T18:30:00.000Z");
  });

  it("formats in India time", () => {
    const friday8pm = new Date("2026-10-23T14:30:00Z");
    expect(formatIST(friday8pm, "time").toLowerCase()).toBe("8:00 pm");
    expect(formatIST(friday8pm, "date")).toBe("23 Oct 2026");
    expect(formatIST(friday8pm).toLowerCase()).toContain("fri");
  });
});

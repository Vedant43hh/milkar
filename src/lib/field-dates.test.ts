import { describe, expect, it } from "vitest";
import { showFieldDate } from "./field-dates";

describe("showFieldDate", () => {
  it("reads date and date-time fields back the way people say them", () => {
    expect(showFieldDate("2026-10-27", "-")).toBe("27 Oct");
    expect(showFieldDate("2026-10-27T20:00", "-")).toBe("27 Oct, 8:00 pm");
    expect(showFieldDate("2026-01-05T00:30", "-")).toBe("5 Jan, 12:30 am");
    expect(showFieldDate("2026-12-31T12:05", "-")).toBe("31 Dec, 12:05 pm");
  });

  it("says when nothing usable is there", () => {
    expect(showFieldDate("", "not set")).toBe("not set");
    expect(showFieldDate("tomorrow", "not set")).toBe("not set");
  });
});

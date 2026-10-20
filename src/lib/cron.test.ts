import { describe, expect, it } from "vitest";
import { isCronAuthorized, tickIntervalMs } from "./cron";

describe("cron access", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(isCronAuthorized("Bearer s3cre", "s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer s3cretX", "s3cret")).toBe(false);
    expect(isCronAuthorized("s3cret", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
  });

  it("is closed when no secret is configured", () => {
    expect(isCronAuthorized("Bearer ", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });

  it("runs the in-process ticker at most every 10 seconds, or not at all", () => {
    expect(tickIntervalMs(0)).toBeNull();
    expect(tickIntervalMs(60)).toBe(60_000);
    expect(tickIntervalMs(1)).toBe(10_000);
  });
});

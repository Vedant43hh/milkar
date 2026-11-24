import { describe, expect, it } from "vitest";
import { isConnectionError, isCronAuthorized, tickIntervalMs } from "./cron";

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

describe("isConnectionError", () => {
  it("retries a dropped or unreachable database, not other failures", () => {
    expect(isConnectionError(Object.assign(new Error("Server has closed the connection."), { code: "P1017" }))).toBe(true);
    expect(isConnectionError({ code: "P1001" })).toBe(true);
    expect(isConnectionError({ code: "ECONNRESET" })).toBe(true);
    expect(isConnectionError({ code: "P2002" })).toBe(false); // a unique-constraint failure is a real problem
    expect(isConnectionError(new Error("boom"))).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});

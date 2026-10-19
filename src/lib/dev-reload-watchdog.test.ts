import { beforeEach, describe, expect, it } from "vitest";
import { recordPageRequest, resetWatchdog } from "./dev-reload-watchdog";

beforeEach(() => resetWatchdog());

describe("dev reload watchdog", () => {
  it("stays quiet for normal browsing", () => {
    for (let i = 0; i < 19; i++) expect(recordPageRequest("/login", 1000 + i * 400)).toBeNull();
    expect(recordPageRequest("/", 9000)).toBeNull();
  });

  it("warns once when one page is requested 20 times in 10 seconds", () => {
    let warning: string | null = null;
    for (let i = 0; i < 20; i++) warning = recordPageRequest("/login", 1000 + i * 300) ?? warning;
    expect(warning).toMatch(/\/login was requested 20 times/);
    expect(recordPageRequest("/login", 7100)).toBeNull(); // no repeat within a minute
  });

  it("forgets requests older than the window", () => {
    for (let i = 0; i < 19; i++) recordPageRequest("/login", i * 100);
    expect(recordPageRequest("/login", 20_000)).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGE_COLOR } from "./theme-colors";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("page colour", () => {
  it("matches --bg in the stylesheet", () => {
    expect(read("../app/globals.css")).toMatch(new RegExp(`:root \\{[^}]*--bg: ${PAGE_COLOR};`));
  });

  it("matches the offline page's own copy of the tokens", () => {
    expect(read("../../public/offline.html")).toContain(`--bg: ${PAGE_COLOR};`);
  });

  it("is the only theme: no dark tokens are left", () => {
    expect(read("../app/globals.css")).not.toMatch(/\.dark\b|prefers-color-scheme: dark/);
  });
});

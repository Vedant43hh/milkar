import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAGE_COLOR } from "./theme-colors";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("page colours", () => {
  it("match --bg in the stylesheet, for both themes", () => {
    const css = read("../app/globals.css");
    expect(css).toMatch(new RegExp(`:root \\{[^}]*--bg: ${PAGE_COLOR.light};`));
    expect(css).toMatch(new RegExp(`\\.dark \\{[^}]*--bg: ${PAGE_COLOR.dark};`));
  });

  it("match the offline page's own copy of the tokens", () => {
    const html = read("../../public/offline.html");
    expect(html).toContain(`--bg: ${PAGE_COLOR.light};`);
    expect(html).toContain(`--bg: ${PAGE_COLOR.dark};`);
  });
});

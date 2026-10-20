// Guards the browser bundle: nothing a client component imports (directly or through other modules)
// may pull in the full dictionary. Client code uses `tu` (src/i18n/ui.ts) or text from the server.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");
const FULL_DICTIONARY = [resolve(SRC, "i18n/index.ts"), resolve(SRC, "i18n/en.ts")];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Value imports only: `import type …` and imports whose every specifier is a type are erased. */
function valueImports(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const specs: string[] = [];
  for (const m of source.matchAll(/^\s*import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gm)) {
    if (m[1]) continue;
    const names = m[2].match(/\{([^}]*)\}/)?.[1];
    const allTypes = names !== undefined && !m[2].replace(/\{[^}]*\}/, "").replace(/,/g, "").trim() && names.split(",").every((n) => !n.trim() || n.trim().startsWith("type "));
    if (!allTypes) specs.push(m[3]);
  }
  for (const m of source.matchAll(/^\s*(?:import|export\s+\*|export\s+\{[^}]*\})\s+from\s+["']([^"']+)["']/gm)) specs.push(m[1]);
  for (const m of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specs.push(m[1]);
  return specs;
}

const directive = (path: string, name: string) => new RegExp(`^\\s*["']${name}["']`).test(readFileSync(path, "utf8"));

describe("client bundle boundary", () => {
  it("keeps the full dictionary out of everything client components import", () => {
    const problems: string[] = [];
    for (const entry of files(SRC).filter((f) => directive(f, "use client"))) {
      const seen = new Set<string>();
      const stack: { file: string; via: string[] }[] = [{ file: entry, via: [] }];
      while (stack.length) {
        const { file, via } = stack.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        // Server actions reach the browser as references only; their code stays on the server.
        if (file !== entry && directive(file, "use server")) continue;
        for (const spec of valueImports(file)) {
          const target = resolveImport(file, spec);
          if (!target) continue;
          const chain = [...via, relative(SRC, file)];
          if (FULL_DICTIONARY.includes(target)) problems.push(`${[...chain, relative(SRC, target)].join(" → ")}`);
          else stack.push({ file: target, via: chain });
        }
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  });
});

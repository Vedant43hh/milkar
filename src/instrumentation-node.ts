// Node.js-only startup checks, imported from instrumentation.ts.
import { assertSafeBoot } from "./lib/env";

try {
  assertSafeBoot();
} catch (error) {
  // Exit instead of serving 500s, so a misconfigured deployment fails loudly.
  console.error(`[milkar] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

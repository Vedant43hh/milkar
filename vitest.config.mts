import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolve = {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // Integration tests share one database, so run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});

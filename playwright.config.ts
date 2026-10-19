import { defineConfig, devices } from "@playwright/test";

// End-to-end smoke tests against a running app with seeded data (npm run db:seed).
// Starts `npm run start` unless something is already listening on the base URL.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// E2E_DEV=1 when testing against `next dev`, which compiles each route on first visit.
const dev = process.env.E2E_DEV === "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: dev ? 120_000 : 30_000,
  expect: { timeout: dev ? 20_000 : 5_000 },
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    // A typical budget Android screen.
    viewport: { width: 360, height: 800 },
    isMobile: false,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

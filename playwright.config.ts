import { defineConfig, devices } from "@playwright/test";

// End-to-end smoke tests against a running app with seeded data (npm run db:seed).
// Starts `npm run start` unless something is already listening on the base URL.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
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

import { execSync } from "node:child_process";
import { test as setup } from "@playwright/test";

// The feature tests change the demo data: slots fill up, prices unlock, rounds close. The golden
// path tells the story from the beginning, so it gets freshly seeded data (see playwright.config.ts).
setup("fresh demo data for the golden path", () => {
  setup.setTimeout(300_000);
  execSync("npx prisma db seed", { stdio: "inherit" });
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin, logout } from "./helpers";

// Uses the seeded demo data (npm run db:seed) and changes it: reseed before running the suite again.

const CAPTAIN = "Sunita Kulkarni";

async function expectNoSeriousA11yIssues(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(serious).toEqual([]);
}

test("a captain opens a grocery round, extends it, and cancels it", async ({ page }) => {
  await demoLogin(page, CAPTAIN);
  await page.goto("/captain");
  await page.getByRole("link", { name: "New grocery round" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New grocery round" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByLabel("Name").fill("E2E staples drive");
  await page.getByLabel("Most per flat for Toor Dal · 1 kg").fill("3");
  await page.getByRole("checkbox", { name: /Iodised Salt/ }).uncheck();
  await page.getByRole("button", { name: "Open grocery round" }).click();

  // The first server-action call compiles on demand under `next dev`, which can take a while.
  await expect(page).toHaveURL(/\/captain\/rounds\/[\w-]+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "E2E staples drive" })).toBeVisible();
  await expect(page.getByText("Round opened. Share it on your WhatsApp group!")).toBeVisible();
  await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*E2E%20staples%20drive/);
  await expect(page.getByText("No orders yet")).toBeVisible();
  const allItems = page.locator("details");
  await allItems.getByText(/All items/).click();
  await expect(allItems.getByText("Toor Dal · 1 kg")).toBeVisible();
  await expect(allItems.getByText(/Iodised Salt/)).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("button", { name: "Extend", exact: true }).click();
  await page.getByRole("dialog", { name: "Extend the cutoff" }).getByRole("button", { name: "Extend cutoff" }).click();
  await expect(page.getByText("Cutoff extended")).toBeVisible();

  await page.getByRole("button", { name: "Cancel round" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this round?" });
  await dialog.getByLabel("Reason (residents will see it)").fill("Testing");
  await dialog.getByRole("button", { name: "Cancel and refund everyone" }).click();
  await expect(page.getByText("Round cancelled. ₹0 refunded to wallets.")).toBeVisible();
  await expect(page.getByText("Reason: Testing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel round" })).toHaveCount(0);
});

test("a captain opens a Service Day from a vendor's service", async ({ page }) => {
  await demoLogin(page, CAPTAIN);
  await page.goto("/captain/rounds/new");
  await page.getByRole("link", { name: /New Service Day/ }).click();
  await page.getByRole("link", { name: /^Kitchen chimney cleaning/ }).click();
  await expect(page.getByText("Kitchen chimney: ₹799 → ₹499 at 12+")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Kitchen chimney cleaning Service Day");
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("button", { name: "Open Service Day" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kitchen chimney cleaning Service Day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Time slots" })).toBeVisible();
  await expect(page.getByText("0 of 2 booked")).toHaveCount(2);
});

test("a poll past its threshold becomes a round in one tap", async ({ page }) => {
  await demoLogin(page, CAPTAIN);
  await page.goto("/captain");
  const ready = page.getByRole("article").filter({ hasText: "Pest control before the monsoon" });
  await expect(ready.getByText(/^\d+ of 20 flats$/)).toBeVisible();
  await ready.getByRole("button", { name: "Open round" }).click();

  // A server action that opens a round and then renders it: allow for a slow machine.
  await expect(page).toHaveURL(/\/captain\/rounds\/[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Pest control before the monsoon" })).toBeVisible();
  await expect(page.getByText("Opened from the poll “Pest control before the monsoon”")).toBeVisible();

  await page.goto("/captain/polls");
  const done = page.getByRole("region", { name: "Closed and converted" });
  await expect(done.getByText("Pest control before the monsoon")).toBeVisible();
  await expect(done.getByRole("link", { name: "View round" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ready to open" })).toHaveCount(0);
});

test("a captain publishes a resident's suggestion", async ({ page }) => {
  await demoLogin(page, CAPTAIN);
  await page.goto("/captain/polls");
  await expectNoSeriousA11yIssues(page);
  const card = page.getByRole("article").filter({ hasText: "Sofa & carpet shampoo before Diwali" });
  await expect(card.getByText("Suggested by Kavita Patil (B-202)")).toBeVisible();
  await card.getByLabel("Flats needed").fill("6");
  await card.getByRole("button", { name: "Publish poll" }).click();
  await expect(page.getByText("Poll published")).toBeVisible();
  const collecting = page.getByRole("region", { name: "Collecting votes" });
  await expect(collecting.getByText("Sofa & carpet shampoo before Diwali")).toBeVisible();
  await expect(collecting.getByText("0 of 6 flats").first()).toBeVisible();
});

test("the AC Service Day dashboard shows flats, slots and the next unlock, and residents follow its link", async ({ page }) => {
  await demoLogin(page, CAPTAIN);
  await page.goto("/captain/rounds");
  const card = page.getByRole("link", { name: /AC servicing Service Day/ });
  const href = await card.getAttribute("href");
  await card.click();
  await expect(page.getByRole("heading", { level: 1, name: "AC servicing Service Day" })).toBeVisible();
  // Next keeps recently visited pages mounted but hidden, so match only what's on screen.
  await expect(page.getByText("6 more flats to unlock ₹400!").filter({ visible: true })).toBeVisible();
  expect(await page.getByText("Full", { exact: true }).count()).toBeGreaterThanOrEqual(2);
  await expectNoSeriousA11yIssues(page);

  const roundId = href!.split("/").pop();
  await logout(page);
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto(`/round/${roundId}`);
  await expect(page).toHaveURL(`/services/${roundId}`);
});

test("residents cannot reach captain pages or another community's rounds", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  for (const path of ["/captain/rounds", "/captain/polls", "/captain/rounds/new/grocery"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
  }
});

test("closing a round early runs the cutoff at once and shows the results", async ({ page }) => {
  await demoLogin(page, CAPTAIN);
  await page.goto("/captain/rounds/new/grocery");
  await page.getByLabel("Name").fill("E2E early close");
  await page.getByRole("button", { name: "Open grocery round" }).click();
  await expect(page).toHaveURL(/\/captain\/rounds\/[\w-]+$/, { timeout: 60_000 });

  await page.getByRole("button", { name: "Close now" }).click();
  await page.getByRole("dialog", { name: "Close orders now?" }).getByRole("button", { name: "Close orders now" }).click();
  await expect(page.getByText("Orders closed and finalized. ₹0 back to wallets.")).toBeVisible({ timeout: 60_000 });
  // Nobody ordered, so nothing reached its minimum.
  await expect(page.getByText(/^Didn't go ahead: not enough orders/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(page.getByText("No orders").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Close now" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel round" })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);

  await page.goto("/captain/rounds");
  await expect(page.getByRole("link", { name: /E2E early close.*Didn.t go ahead/ })).toBeVisible();
});

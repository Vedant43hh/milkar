import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin } from "./helpers";

// Uses the seeded demo data (npm run db:seed) and changes it: reseed before running the suite again.

async function expectNoSeriousA11yIssues(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(serious).toEqual([]);
}

/** Taps a time slot (the radio itself is visually hidden inside its label). */
async function pickSlot(page: Page, which: { checked?: boolean } = {}) {
  await page.locator("label", { has: page.getByRole("radio", { disabled: false, ...which }) }).first().click();
}

/** Pays the open review: from the wallet, or on the test UPI screen. Ends back on the Service Day. */
async function payReview(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Your changes" });
  const pay = sheet.getByRole("button", { name: /^(Pay ₹[\d,]+ with UPI|Confirm changes)$/ });
  await expect(pay).toBeVisible({ timeout: 30_000 });
  const viaUpi = (await pay.textContent())?.startsWith("Pay") ?? false;
  await pay.click();
  if (viaUpi) {
    await expect(page).toHaveURL(/\/pay\//, { timeout: 30_000 });
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
  }
  await expect(page).toHaveURL(/\/services\/[\w-]+$/, { timeout: 30_000 });
}

test("a resident books a Service Day: options, a slot with room, and checkout", async ({ page }) => {
  await demoLogin(page, "Sunita Kulkarni"); // her flat hasn't booked the AC Service Day
  await page.goto("/services");
  await expect(page.getByRole("heading", { level: 1, name: "Services" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("link", { name: /AC servicing Service Day/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AC servicing Service Day" })).toBeVisible();

  await page.getByRole("button", { name: "Add Split AC" }).click();
  await expect(page.getByText("15 flats so far")).toBeVisible(); // your flat, previewed
  await expect(page.getByText("Pick a time slot below to book.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Review changes/ })).toBeDisabled();

  const full = page.getByRole("radio", { disabled: true });
  expect(await full.count()).toBeGreaterThanOrEqual(2); // full slots can't be picked
  await expectNoSeriousA11yIssues(page);
  await pickSlot(page);
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  await page.getByRole("button", { name: /^Review changes/ }).click();
  await payReview(page);

  await expect(page.getByRole("heading", { name: "Your time slot" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/In your booking: 1/)).toBeVisible();
  await page.goto("/services");
  await expect(page.getByText(/^Booked: /)).toBeVisible();
});

test("a booked resident changes slot for free", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh"); // already booked for the AC Service Day
  await page.goto("/services");
  await page.getByRole("link", { name: /AC servicing Service Day/ }).click();
  const slot = page.getByRole("region", { name: "Your time slot" });
  const before = await slot.textContent();
  await page.getByRole("button", { name: "Change slot" }).click();
  await pickSlot(page, { checked: false }); // the picker closes once a slot is chosen
  await expect(page.getByText(/^Moved to /)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(slot.getByRole("button", { name: "Change slot" })).toBeVisible();
  expect(await slot.textContent()).not.toEqual(before);
});

test("a resident confirms last week's held car-wash slot and turns on auto-pay", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.getByRole("link", { name: "Confirm" }).first().click(); // the held-slot banner on the home screen
  await expect(page).toHaveURL(/\/services\//);
  await expect(page.getByText(/^Your usual slot is held until/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your time slot" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole("button", { name: /^Review changes/ }).click(); // last week's order is filled in
  await payReview(page);
  await expect(page.getByText(/^Your usual slot is held until/)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Change slot" })).toBeVisible();

  // Now booked, the weekly settings save straight away.
  const autoPay = page.getByRole("switch", { name: "Pay from my wallet automatically" });
  await expect(autoPay).not.toBeChecked();
  await page.locator("label", { has: autoPay }).click();
  await expect(page.getByText("Weekly settings saved")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Pay from my wallet automatically" })).toBeChecked();
});

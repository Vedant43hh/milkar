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

/** Opens the review sheet, then pays: straight from the wallet, or through the test UPI screen. */
async function reviewAndPay(page: Page) {
  await page.getByRole("button", { name: /^Review changes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Your changes" });
  const pay = sheet.getByRole("button", { name: /^(Pay ₹[\d,]+ with UPI|Confirm changes)$/ });
  await expect(pay).toBeVisible({ timeout: 30_000 });
  const viaUpi = (await pay.textContent())?.startsWith("Pay") ?? false;
  await pay.click();
  if (viaUpi) {
    await expect(page).toHaveURL(/\/pay\//, { timeout: 30_000 });
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(page).toHaveURL(/\/groceries\?round=/, { timeout: 30_000 });
  }
}

test("a resident buys the bag that unlocks a better price for everyone", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/groceries");
  await expect(page.getByRole("heading", { level: 1, name: "Groceries" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  const rice = page.getByRole("listitem").filter({ hasText: "Sona Masoori Rice" }).filter({ visible: true });
  await expect(rice.getByText("1 more pack to unlock ₹440!")).toBeVisible();
  await rice.getByRole("button", { name: "Add Sona Masoori Rice 5 kg" }).click();
  await expect(rice.getByText("Best price unlocked")).toBeVisible(); // the meter previews your change

  await page.getByRole("button", { name: /^Review changes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Your changes" });
  await expect(sheet.getByText("1 × ₹465")).toBeVisible({ timeout: 30_000 }); // charged at the tier before the change
  await page.keyboard.press("Escape");
  await reviewAndPay(page);

  await expect(page.getByText("🎉 Price unlocked! Everyone now pays ₹440 for Sona Masoori Rice")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "Sona Masoori Rice" }).filter({ visible: true }).getByText(/In your order: 1 \(₹465 paid\)/)).toBeVisible();
});

test("reducing an order before the freeze refunds the wallet", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/groceries");
  const mine = page.getByRole("listitem").filter({ hasText: /In your order: \d/ }).filter({ hasNotText: "Sona Masoori" }).filter({ visible: true }).first();
  await mine.getByRole("button", { name: /^One less/ }).click();
  await page.getByRole("button", { name: /^Review changes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Your changes" });
  await expect(sheet.getByText(/back to your wallet$/)).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole("button", { name: "Confirm changes" }).click();
  await expect(page.getByText("Your order is updated")).toBeVisible({ timeout: 30_000 });
});

test("declining at the test UPI screen leaves the order as it was", async ({ page }) => {
  await demoLogin(page, "Arnav Sinha"); // a PG resident with an empty wallet
  await page.goto("/groceries");
  await expect(page.getByRole("heading", { level: 2, name: "Room essentials" })).toBeVisible();
  await page.getByRole("button", { name: /^(Add|One more) /, disabled: false }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /^Review changes/ }).click();
  await page.getByRole("dialog", { name: "Your changes" }).getByRole("button", { name: /^Pay ₹[\d,]+ with UPI$/ }).click({ timeout: 30_000 });

  await expect(page).toHaveURL(/\/pay\//, { timeout: 30_000 });
  await expect(page.getByText("Test payment: no real money moves.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("button", { name: "Cancel payment" }).click();
  await expect(page).toHaveURL(/\/groceries\?round=/, { timeout: 30_000 });
  await expect(page.getByText("Payment cancelled. Your order hasn't changed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Review changes/ })).toHaveCount(0);
});

test("a resident votes on a poll and takes the vote back", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/polls");
  await expectNoSeriousA11yIssues(page);
  const tank = page.getByRole("article").filter({ hasText: "Water tank cleaning" }).filter({ visible: true });
  await expect(tank.getByText("12 of 20 flats")).toBeVisible();
  await tank.getByRole("button", { name: "I'd join this" }).click();
  await expect(tank.getByRole("button", { name: "You're in" })).toHaveAttribute("aria-pressed", "true");
  await expect(tank.getByText("13 of 20 flats")).toBeVisible();
  await expect(page.getByText("You're in. 13 of 20 flats so far.")).toBeVisible({ timeout: 30_000 });

  await tank.getByRole("button", { name: "You're in" }).click();
  await expect(tank.getByText("12 of 20 flats")).toBeVisible();
  await expect(page.getByText("You're out of this poll.")).toBeVisible({ timeout: 30_000 });
});

test("a resident suggests a poll for the captain", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/polls/suggest");
  await expectNoSeriousA11yIssues(page);
  await page.getByLabel("What would you like?").fill("E2E chimney cleaning");
  await page.getByLabel("Is it one of these?").selectOption({ label: "Kitchen chimney cleaning" });
  await page.getByRole("button", { name: "Send to your captain" }).click();
  await expect(page).toHaveURL("/polls", { timeout: 30_000 });
  await expect(page.getByText("Thanks! Your captain will review your suggestion.")).toBeVisible();
  const mine = page.getByRole("region", { name: "Your suggestions" });
  await expect(mine.getByText("E2E chimney cleaning")).toBeVisible();
  await expect(mine.getByText("Waiting for your captain").first()).toBeVisible();
});

test("the home screen shows open rounds, savings, the visit code, the held slot and polls", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await expect(page.getByRole("heading", { level: 1, name: "Namaste, Rahul" })).toBeVisible();
  await expect(page.getByText(/^Your usual Weekly car wash slot is held until/)).toBeVisible();
  await expect(page.getByText("Saved this month")).toBeVisible();
  const open = page.getByRole("region", { name: "Open now" });
  await expect(open.getByRole("link", { name: /This week's group drive/ })).toBeVisible();
  const visits = page.getByRole("region", { name: "Upcoming visits" });
  await expect(visits.getByText("Weekly car wash")).toBeVisible();
  await expect(visits.getByText(/^Code \d{4}$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "What neighbours want next" }).getByRole("article").first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

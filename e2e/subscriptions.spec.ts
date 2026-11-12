import { expect, test } from "@playwright/test";
import { demoLogin, expectNoSeriousA11yIssues, logout } from "./helpers";

// Weekly groceries: Rahul keeps his "Weekly milk & eggs" order every week with auto-pay. Uses the
// seeded demo data (npm run db:seed) and changes it: reseed before running again.

test("a resident sees their weekly order, pauses and resumes it", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/app/orders");
  await page.getByRole("link", { name: "Subscriptions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Subscriptions" })).toBeVisible({ timeout: 60_000 });
  const sub = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Weekly milk & eggs" }) });
  await expect(sub.getByText("Active", { exact: true })).toBeVisible();
  await expect(sub.getByText(/× Toned Milk \(pouch\)/)).toBeVisible();
  await expect(sub.getByLabel("Pay from my wallet automatically")).toBeChecked();
  await expectNoSeriousA11yIssues(page);

  await sub.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused. Nothing is ordered until you resume.")).toBeVisible();
  await expect(sub.getByText("Paused", { exact: true })).toBeVisible();
  await sub.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Resumed. Next week's order will be placed as usual.")).toBeVisible();

  // The order page says it's kept every week.
  await page.goto("/app/orders");
  await page.getByRole("link", { name: /Weekly milk & eggs/ }).click();
  await expect(page.getByRole("region", { name: "Every week" }).getByText(/You get this every week/)).toBeVisible({ timeout: 60_000 });
});

test("when the week closes, next week's order is placed and paid from the wallet", async ({ page }) => {
  await demoLogin(page, "Sunita Kulkarni");
  await page.goto("/manager/rounds");
  await page.getByRole("link", { name: /Weekly milk & eggs/ }).first().click();
  await page.getByRole("button", { name: "Close now" }).click();
  await page.getByRole("dialog", { name: "Close orders now?" }).getByRole("button", { name: "Close orders now" }).click();
  await expect(page.getByText(/^Orders closed and finalized\./)).toBeVisible({ timeout: 60_000 });
  await logout(page);

  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/app/subscriptions");
  const sub = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Weekly milk & eggs" }) });
  await expect(sub.getByText(/Ordered for this week/)).toBeVisible({ timeout: 60_000 });
  await page.goto("/app/notifications");
  await expect(page.getByText("This week's Weekly milk & eggs is ordered").first()).toBeVisible({ timeout: 60_000 });
});

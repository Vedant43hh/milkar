import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

// Uses the seeded notifications (npm run db:seed). Marking them read changes the data, so reseed
// before running the suite again.

test("the bell shows unread notifications, and opening one marks it read", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  const bell = page.getByRole("link", { name: /^Notifications, \d+ unread$/ });
  await expect(bell).toBeVisible();
  const before = Number((await bell.getAttribute("aria-label"))?.match(/(\d+) unread/)?.[1]);
  expect(before).toBeGreaterThan(0);

  await bell.click();
  await expect(page).toHaveURL("/notifications");
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  await expect(page.getByText(`${before} unread`, { exact: true })).toBeVisible();

  // The newest unread one opens its page and stops counting as unread.
  const unread = page.getByRole("listitem").filter({ hasText: "Unread" });
  await unread.first().getByRole("button").click();
  await expect(page).not.toHaveURL("/notifications");
  await page.goto("/notifications");
  if (before > 1) await expect(page.getByText(`${before - 1} unread`, { exact: true })).toBeVisible();
  else await expect(page.getByTestId("unread-badge")).toHaveCount(0);
});

test("mark all as read clears the badge", async ({ page }) => {
  await demoLogin(page, "Sunita Kulkarni");
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("All notifications marked as read.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByTestId("unread-badge")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);
});

test("notifications render from their stored details", async ({ page }) => {
  await demoLogin(page, "Sunita Kulkarni");
  await page.goto("/notifications");
  await expect(page.getByText(/^Pest control before the monsoon: \d+ flats are in$/)).toBeVisible();
  await expect(page.getByText("New idea: Sofa & carpet shampoo before Diwali")).toBeVisible();
});

test("vendors have their own notification centre", async ({ page }) => {
  await demoLogin(page, "Manoj Yadav");
  await expect(page).toHaveURL("/vendor");
  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(page).toHaveURL("/vendor/notifications");
  await expect(page.getByText("New order: Weekly car wash")).toBeVisible();
});

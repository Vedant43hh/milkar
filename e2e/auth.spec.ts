import { expect, test } from "@playwright/test";
import { demoLogin, loginWithOtp, logout, uniquePhone } from "./helpers";

test("a new resident joins through the invite link", async ({ page }) => {
  await page.goto("/join/GREENMDW");
  await expect(page.getByText("Green Meadows CHS, Pune")).toBeVisible();
  await page.getByRole("link", { name: "Log in with your phone to join" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fjoin%2FGREENMDW/);

  await loginWithOtp(page, uniquePhone());
  await expect(page).toHaveURL(/\/join\/GREENMDW$/);

  await page.getByLabel("Your name").fill("Test Resident");
  await page.getByLabel("Tower", { exact: true }).selectOption("B");
  await page.getByLabel("Flat number").selectOption({ label: "201" });
  await page.getByRole("button", { name: "Join Green Meadows CHS" }).click();

  await expect(page).toHaveURL("/app");
  await expect(page.getByText("Welcome to Green Meadows CHS!")).toBeVisible(); // flash toast
  await expect(page.getByRole("heading", { level: 1, name: "Namaste, Test" })).toBeVisible();
  await expect(page.getByText("Flat B-201, Green Meadows CHS")).toBeVisible();
});

test("a PG resident joins with the PG's own labels: wing and room", async ({ page }) => {
  await page.goto("/join/SUNRISE");
  await expect(page.getByText("Sunrise Co-living, Bengaluru")).toBeVisible();
  await page.getByRole("link", { name: "Log in with your phone to join" }).click();
  await loginWithOtp(page, uniquePhone());
  await expect(page).toHaveURL(/\/join\/SUNRISE$/);

  await page.getByLabel("Your name").fill("Test Tenant");
  await page.getByLabel("Wing", { exact: true }).selectOption("B");
  await page.getByLabel("Room number").selectOption({ label: "102" });
  await page.getByRole("button", { name: "Join Sunrise Co-living" }).click();
  await expect(page).toHaveURL("/app");
  await expect(page.getByText("Room B-102, Sunrise Co-living")).toBeVisible();
});

test("invalid phone numbers are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Enter a valid 10-digit Indian mobile number.");
});

test("a new user without a flat is sent to join a community", async ({ page }) => {
  await page.goto("/login");
  await loginWithOtp(page, uniquePhone());
  await expect(page).toHaveURL("/join");
  await page.getByLabel("Invite code").fill("greenmdw");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/join/GREENMDW");
  await expect(page.getByLabel("Your name")).toBeVisible();
});

test("a Society Manager lands in the manager portal, and only there", async ({ page }) => {
  await demoLogin(page, "Sunita Kulkarni");
  await expect(page).toHaveURL("/manager");
  await expect(page.getByRole("heading", { level: 1, name: "Society Manager" })).toBeVisible();

  // One portal per account: the resident app is for residents, even for a manager.
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: "This area is for residents" })).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "This area is for platform admins" })).toBeVisible();
});

test("residents opening the manager portal are shown the way back", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await expect(page.getByText("Flat A-101, Green Meadows CHS")).toBeVisible();
  await page.goto("/manager");
  await expect(page).toHaveURL("/manager"); // no silent redirect
  await expect(page.getByRole("heading", { level: 1, name: "This area is for Society Managers" })).toBeVisible();
  await page.getByRole("link", { name: "Go to my portal" }).click();
  await expect(page).toHaveURL("/app");
});

test("vendors and admins land in their own areas", async ({ page }) => {
  await demoLogin(page, "Ramesh Agarwal");
  await expect(page).toHaveURL("/vendor");
  await expect(page.getByRole("heading", { level: 1, name: /Vendor · Shree Balaji Wholesale Traders/ })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1, name: "This area is for residents" })).toBeVisible();

  await logout(page);
  await demoLogin(page, "Priya Nair");
  await expect(page).toHaveURL("/admin");
  await page.goto("/join/GREENMDW");
  await expect(page.getByText("Invite links are for residents. You're logged in as Platform admin.")).toBeVisible();
});

test("logging out ends the session", async ({ page, context }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await expect(page).toHaveURL("/app");
  await logout(page);
  expect((await context.cookies()).some((c) => c.name === "milkar_session")).toBe(false);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
});

test("a logged-in user visiting /login goes to their portal", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/login");
  await expect(page).toHaveURL("/app");
});

test("the landing page is public", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Your building buys together. Everyone pays less." })).toBeVisible();
});

test("a forged session cookie is treated as logged out", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "milkar_session", value: "forged-token", url: baseURL! }]);
  await page.goto("/manager");
  await expect(page).toHaveURL(/\/login/);
});

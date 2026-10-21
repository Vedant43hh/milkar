import { expect, test } from "@playwright/test";
import { demoLogin, loginWithOtp, logout, nextStep, uniquePhone, verifyPhoneAndSubmit } from "./helpers";

test("an invite link starts resident registration with the community filled in", async ({ page }) => {
  await page.goto("/join/GREENMDW");
  await expect(page).toHaveURL("/register?role=resident&code=GREENMDW");
  await expect(page.getByText("Green Meadows CHS, Pune")).toBeVisible();
});

test("a PG resident registers with the PG's own labels: wing and room", async ({ page }) => {
  await page.goto("/join/SUNRISE");
  await expect(page.getByText("Sunrise Co-living, Bengaluru")).toBeVisible();
  await nextStep(page);
  await page.getByLabel("Wing", { exact: true }).selectOption("B");
  await page.getByLabel("Room number").selectOption({ label: "102" });
  await nextStep(page);
  await page.getByLabel("Your name").fill("Test Tenant");
  await nextStep(page);
  await verifyPhoneAndSubmit(page, uniquePhone(), "Send my request");
  await expect(page).toHaveURL("/app/join", { timeout: 60_000 });
  await expect(page.getByText(/You asked to join Sunrise Co-living as Room B-102/)).toBeVisible();
});

test("invalid phone numbers are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Enter a valid 10-digit Indian mobile number.");
});

test("logging in with a number nobody registered offers registration instead", async ({ page }) => {
  await page.goto("/login");
  await loginWithOtp(page, uniquePhone());
  await expect(page.getByText("No account with this number yet")).toBeVisible();
  await page.getByRole("link", { name: "Register instead" }).click();
  await expect(page).toHaveURL("/register");
  await expect(page.getByRole("heading", { level: 1, name: "How will you use Milkar?" })).toBeVisible();
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
  await page.goto("/join/GREENMDW"); // invite links are for new residents
  await page.getByRole("link", { name: "Go to my portal" }).click();
  await expect(page).toHaveURL("/admin");
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

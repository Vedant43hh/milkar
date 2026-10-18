import { expect, test, type Page } from "@playwright/test";

const uniquePhone = () => `9${String(Date.now()).slice(-9)}`;

async function loginWithOtp(page: Page, phone: string) {
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/Code sent to \+91/)).toBeVisible();
  await page.getByLabel("6-digit code").fill("123456"); // mock mode accepts any 6 digits
  await page.getByRole("button", { name: "Verify and log in" }).click();
}

async function demoLogin(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Log in as ${name}`) }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

test("a new resident joins through the invite link", async ({ page }) => {
  await page.goto("/join/GREENMDW");
  await expect(page.getByText("Green Meadows CHS, Pune")).toBeVisible();
  await page.getByRole("link", { name: "Log in with your phone to join" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fjoin%2FGREENMDW/);

  await loginWithOtp(page, uniquePhone());
  await expect(page).toHaveURL(/\/join\/GREENMDW$/);

  await page.getByLabel("Your name").fill("Test Resident");
  await page.getByLabel("Tower / wing").selectOption("B");
  await page.getByLabel("Flat number").selectOption({ label: "201" });
  await page.getByRole("button", { name: "Join Green Meadows CHS" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Namaste, Test Resident" })).toBeVisible();
  await expect(page.getByText("Flat B-201, Green Meadows CHS")).toBeVisible();
  await expect(page.getByRole("link", { name: "Captain tools" })).toHaveCount(0);
});

test("invalid phone numbers are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Enter a valid 10-digit Indian mobile number.");
});

test("a new user without a flat is sent to join a society", async ({ page }) => {
  await page.goto("/login");
  await loginWithOtp(page, uniquePhone());
  await expect(page).toHaveURL("/join");
  await expect(page.getByLabel("Invite code")).toBeVisible();
  await page.getByLabel("Invite code").fill("greenmdw");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/join/GREENMDW");
  await expect(page.getByLabel("Your name")).toBeVisible();
});

test("the captain demo login reaches captain tools but not admin", async ({ page }) => {
  await demoLogin(page, "Sunita Kulkarni");
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Flat B-402, Green Meadows CHS")).toBeVisible();
  await page.getByRole("link", { name: "Captain tools" }).click();
  await expect(page.getByRole("heading", { name: "Captain" })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL("/");
  await page.goto("/supplier");
  await expect(page).toHaveURL("/");
});

test("residents cannot open captain tools", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await expect(page.getByText("Flat A-101, Green Meadows CHS")).toBeVisible();
  await page.goto("/captain");
  await expect(page).toHaveURL("/");
});

test("suppliers and admins land in their own areas", async ({ page }) => {
  await demoLogin(page, "Ramesh Agarwal");
  await expect(page).toHaveURL("/supplier");
  await expect(page.getByRole("heading", { name: /Supplier · Shree Balaji Wholesale Traders/ })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL("/supplier");

  await page.getByRole("button", { name: "Log out" }).click();
  await demoLogin(page, "Priya Nair");
  await expect(page).toHaveURL("/admin");
  await page.goto("/join/GREENMDW");
  await expect(page.getByText("Invite links are for residents. You're logged in as Platform admin.")).toBeVisible();
});

test("logging out ends the session", async ({ page, context }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");
  expect((await context.cookies()).some((c) => c.name === "milkar_session")).toBe(false);
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("a logged-in user visiting /login goes home", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/login");
  await expect(page).toHaveURL("/");
});

test("a forged session cookie is treated as logged out", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "milkar_session", value: "forged-token", url: baseURL! }]);
  await page.goto("/captain");
  await expect(page).toHaveURL(/\/login/);
});

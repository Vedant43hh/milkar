import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { demoLogin } from "./helpers";

// One portal per role. Every role is let into its own portal only; anywhere else it sees a
// friendly "this area is for …" page (no silent redirect, no navigation into the portal) with a
// button back to its own.

const WRONG_PORTAL_TITLE: Record<string, string> = {
  "/app": "This area is for residents",
  "/manager": "This area is for Society Managers",
  "/vendor": "This area is for vendors",
  "/tech": "This area is for technicians",
  "/admin": "This area is for platform admins",
};

const ACCOUNTS: { name: string; home: string; heading: string | RegExp; deep: string }[] = [
  { name: "Rahul Deshmukh", home: "/app", heading: "Namaste, Rahul", deep: "/app/wallet" },
  { name: "Sunita Kulkarni", home: "/manager", heading: "Society Manager", deep: "/manager/rounds/new/grocery" },
  { name: "Manoj Yadav", home: "/vendor", heading: /^Vendor · WashWell Car Wash$/, deep: "/vendor/notifications" },
  { name: "Raju Thapa", home: "/tech", heading: "Today's visits", deep: "/tech/upcoming" },
  { name: "Priya Nair", home: "/admin", heading: "Admin", deep: "/admin/notifications" },
];

for (const account of ACCOUNTS) {
  test(`${account.name} only gets into ${account.home}`, async ({ page }) => {
    await demoLogin(page, account.name);
    await expect(page).toHaveURL(account.home);
    await expect(page.getByRole("heading", { level: 1, name: account.heading })).toBeVisible();

    for (const other of ACCOUNTS.filter((a) => a !== account)) {
      for (const path of [other.home, other.deep]) {
        await page.goto(path);
        await expect(page).toHaveURL(path);
        await expect(page.getByRole("heading", { level: 1, name: WRONG_PORTAL_TITLE[other.home] })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Menu", exact: true })).toHaveCount(0); // staff portals' drawer
      }
    }
    await page.getByRole("link", { name: "Go to my portal" }).click();
    await expect(page).toHaveURL(account.home);
  });
}

test("signed-out visitors are asked to log in, then land where they were going", async ({ page }) => {
  await page.goto("/tech/upcoming");
  await expect(page).toHaveURL(/\/login\?next=%2Ftech%2Fupcoming$/);
  await page.getByRole("button", { name: /Log in as Raju Thapa/ }).click();
  await expect(page).toHaveURL("/tech/upcoming");
});

test("the wrong-portal page is accessible", async ({ page }) => {
  await demoLogin(page, "Raju Thapa");
  await page.goto("/manager");
  await expect(page.getByRole("heading", { level: 1, name: "This area is for Society Managers" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

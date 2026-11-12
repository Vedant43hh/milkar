import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { demoLogin, expectNoSeriousA11yIssues, loginWithOtp, logout, uniquePhone } from "./helpers";

// The vendor portal: orders, the schedule, the catalogue, technicians, earnings and the profile.
// Uses the seeded demo data (npm run db:seed) and changes it: reseed before running again.

const GROCER = "Ramesh Agarwal"; // Shree Balaji: Weekend staples waiting to be acknowledged
const REPAIRS = "Sameer Kulkarni"; // FixRight: today's Carpenter Day

test("the overview shows orders to acknowledge, deliveries and earnings", async ({ page }) => {
  await demoLogin(page, GROCER);
  const ack = page.getByRole("region", { name: "Orders to acknowledge" });
  await expect(ack.getByRole("link", { name: /Weekend staples/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Earnings" }).getByText("Paid so far")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your rating" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("an order: its lines, a CSV copy, and acknowledging it once", async ({ page }) => {
  await demoLogin(page, GROCER);
  await page.goto("/vendor/orders");
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.getByRole("region", { name: "To acknowledge" }).getByRole("link", { name: /Weekend staples/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Purchase order PO-\d+$/ })).toBeVisible();
  await expect(page.getByText("Green Meadows CHS", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What you're paid" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^milkar-PO-\d+\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Purchase order,PO-");
  expect(csv).toContain("Weekend staples");
  expect(csv).toMatch(/\r\n,,,,Total,,,\d+\.\d{2}\r\n$/);

  await page.getByRole("button", { name: "Acknowledge order" }).click();
  await expect(page.getByText("Acknowledged. The Society Manager knows you're on it.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Acknowledge order" })).toHaveCount(0);
  await expect(page.getByRole("article").getByText("Acknowledged", { exact: true })).toBeVisible();
});

test("another vendor's order and its CSV are not found", async ({ page }) => {
  await demoLogin(page, GROCER);
  await page.goto("/vendor/orders");
  const href = await page.getByRole("link", { name: /Weekend staples/ }).first().getAttribute("href");
  await logout(page);
  await demoLogin(page, REPAIRS);
  const response = await page.request.get(`${href}/csv`);
  expect(response.status()).toBe(404);
  await page.goto(href!);
  await expect(page.getByRole("heading", { name: /Purchase order/ })).toHaveCount(0);
});

test("the schedule groups today's visits, and a visit moves to a free technician", async ({ page }) => {
  const phone = uniquePhone();
  await demoLogin(page, REPAIRS);
  await page.goto("/vendor/technicians");
  await page.getByLabel("Name", { exact: true }).fill("Arjun Test");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Add technician" }).click();
  await expect(page.getByText("Technician added. They can log in with that number now.")).toBeVisible();

  await page.goto("/vendor/schedule");
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  await expect(page.getByText(/Green Meadows CHS · Tower [A-D]/).first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Change technician" }) }).first();
  const flat = (await row.getByText(/^Flat [A-D]-\d+$/).textContent())!;
  await row.getByRole("button", { name: "Change technician" }).click();
  const sheet = page.getByRole("dialog", { name: "Who does this visit?" });
  await sheet.getByLabel("Technician").selectOption({ label: "Arjun Test" });
  await sheet.getByRole("button", { name: "Give them this visit" }).click();
  await expect(page.getByText("Arjun Test has this visit now.")).toBeVisible();
  const moved = page.getByRole("listitem").filter({ hasText: flat }).filter({ hasText: "Technician: Arjun Test" });
  await expect(moved).toHaveCount(1);

  // Arjun has a visit to do, so he can't be turned off yet.
  await page.goto("/vendor/technicians");
  const arjun = page.getByRole("listitem").filter({ hasText: "Arjun Test" });
  await expect(arjun.getByText("Visits to do: 1")).toBeVisible();
  await arjun.getByRole("button", { name: "Turn off" }).click();
  await page.getByRole("dialog", { name: "Turn off Arjun Test?" }).getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("They still have visits to do (1). Give those to someone else on the Schedule first.")).toBeVisible();
});

test("a technician who's turned off can't log in until they're turned back on", async ({ page }) => {
  const phone = uniquePhone();
  await demoLogin(page, "Suresh Pillai");
  await page.goto("/vendor/technicians");
  await page.getByLabel("Name", { exact: true }).fill("Kiran Test");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Add technician" }).click();
  await expect(page.getByText("Technician added. They can log in with that number now.")).toBeVisible();
  const kiran = page.getByRole("listitem").filter({ hasText: "Kiran Test" });
  await kiran.getByRole("button", { name: "Turn off" }).click();
  await page.getByRole("dialog", { name: "Turn off Kiran Test?" }).getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Turned off. They can't log in now.")).toBeVisible();
  await expect(kiran.getByText("Turned off", { exact: true })).toBeVisible();
  await logout(page);

  await loginWithOtp(page, phone);
  await expect(page.getByText("This account has been turned off by your vendor. Ask them to turn it back on.")).toBeVisible();

  await demoLogin(page, "Suresh Pillai");
  await page.goto("/vendor/technicians");
  await page.getByRole("listitem").filter({ hasText: "Kiran Test" }).getByRole("button", { name: "Turn back on" }).click();
  await expect(page.getByText("Turned back on. They can log in again.")).toBeVisible();
  await logout(page);
  await loginWithOtp(page, phone);
  await expect(page).toHaveURL(/\/tech/, { timeout: 60_000 }); // a first visit compiles slowly on next dev
});

test("the catalogue checks prices, shows what residents pay, and adds a product", async ({ page }) => {
  await demoLogin(page, GROCER);
  await page.goto("/vendor/catalogue");
  await expect(page.getByRole("heading", { level: 1, name: "Catalogue" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("link", { name: /Sona Masoori Rice/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sona Masoori Rice" })).toBeVisible({ timeout: 60_000 });

  // A dearer price for more bags is refused.
  const first = page.getByLabel("Price tier 1: Your price (₹)");
  const second = page.getByLabel("Price tier 2: Your price (₹)");
  const original = await first.inputValue();
  await second.fill(String(Number(original) + 10));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Price 2: it must be lower than the price before it.")).toBeVisible();
  // Residents' price follows what's typed.
  await first.fill("400");
  await expect(page.getByText(/^Residents pay ₹\d/).first()).toBeVisible();
  await second.fill("390");
  await page.getByLabel("Price tier 3: Your price (₹)").fill("380");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL("/vendor/catalogue");
  await expect(page.getByText("Saved. Group buys opened from now on use this.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Sona Masoori Rice/ }).getByText(/Your price ₹400 → ₹390 at \d+\+ → ₹380 at \d+\+/)).toBeVisible();

  await page.getByRole("link", { name: "Add a product" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New product" })).toBeVisible({ timeout: 60_000 });
  // The rice page is still in the document, hidden (Next keeps it for back/forward): skip its fields.
  const field = (label: string) => page.getByLabel(label, { exact: true }).filter({ visible: true });
  await field("Name").fill("Kolam Rice");
  await field("Pack size").fill("10");
  await field("MRP (₹)").fill("900");
  await field("Price tier 1: From (packs)").fill("1");
  await field("Price tier 1: Your price (₹)").fill("780");
  await field("Price tier 2: From (packs)").fill("25");
  await field("Price tier 2: Your price (₹)").fill("740");
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("button", { name: "Save" }).filter({ visible: true }).click();
  await expect(page).toHaveURL("/vendor/catalogue");
  await page.getByRole("link", { name: /Kolam Rice/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kolam Rice" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Stop offering" }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "Stop offering Kolam Rice?" }).getByRole("button", { name: "Stop offering" }).click();
  await expect(page.getByText("No longer offered in new group buys.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Offer again" })).toBeVisible();
});

test("a service's time slots can't overlap", async ({ page }) => {
  await demoLogin(page, REPAIRS);
  await page.goto("/vendor/catalogue");
  await page.getByRole("link", { name: /Plumber/ }).first().click();
  await expect(page.getByRole("region", { name: "Daily time slots" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  const add = page.getByRole("group", { name: "Add slot" });
  const firstStart = await page.getByRole("region", { name: "Daily time slots" }).getByLabel("Starts").first().inputValue();
  await add.getByLabel("Starts").fill(firstStart);
  await add.getByLabel("Ends").fill("23:00");
  await page.getByRole("button", { name: "Add slot" }).click();
  await expect(page.getByText("It overlaps another slot.")).toBeVisible();
});

test("earnings show each payout, and the profile the rating and verification", async ({ page }) => {
  await demoLogin(page, GROCER);
  await page.goto("/vendor/earnings");
  await expect(page.getByRole("heading", { level: 1, name: "Earnings" })).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Your payout").first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.goto("/vendor/profile");
  await expect(page.getByText("Verified vendor")).toBeVisible();
  await expect(page.getByRole("region", { name: "Rating" })).toBeVisible();
  await logout(page);

  await demoLogin(page, "Manoj Yadav"); // WashWell, not verified yet
  await page.goto("/vendor/profile");
  await expect(page.getByRole("region", { name: "Getting verified" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

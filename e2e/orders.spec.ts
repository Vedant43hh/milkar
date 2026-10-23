import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin, logout } from "./helpers";

// Uses the seeded demo data (npm run db:seed): the chimney visits from yesterday are rated and
// complained about here, so reseed before running the suite again.

async function expectNoSeriousA11yIssues(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(serious).toEqual([]);
}

/** Opens a round from the orders list by its title. */
async function openOrder(page: Page, title: string) {
  await page.goto("/app/orders");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test("home shows the categories, live group buys with neighbours' flats, and the community's impact", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  const chips = page.getByRole("group", { name: "Group buys by kind" });
  await expect(chips.getByRole("link", { name: /Groceries/ })).toBeVisible();
  await expect(chips.getByRole("link", { name: /Subscriptions/ })).toBeVisible();

  const ac = page.getByRole("link", { name: /AC servicing Service Day/ }).first();
  await expect(ac.getByText("6 more flats to unlock ₹400!")).toBeVisible();
  await expect(ac.getByRole("img", { name: /^14 neighbours joined: / })).toBeVisible(); // flat numbers, never names

  const impact = page.getByRole("region", { name: "Community impact" });
  await expect(impact.getByText("Vendor trips avoided")).toBeVisible();
  await expect(impact.getByText(/separate trips became/)).toBeVisible();
  await impact.getByText(/How we estimate/).click();
  await expect(impact.getByText(/about 8 km there and back/)).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await chips.getByRole("link", { name: /Home services/ }).click();
  await expect(page).toHaveURL("/app/buys/home-services");
  await expect(page.getByRole("heading", { level: 1, name: "Home services" })).toBeVisible();
  await expect(page.getByRole("link", { name: /AC servicing Service Day/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Weekly car wash/ })).toHaveCount(0); // that's a subscription
  await expectNoSeriousA11yIssues(page);
});

test("a category with nothing open points to the polls", async ({ page }) => {
  await demoLogin(page, "Arnav Sinha"); // Sunrise Co-living only has a grocery round open
  await page.goto("/app/buys/repairs");
  await expect(page.getByText("Nothing open in repairs right now")).toBeVisible();
  await page.getByRole("link", { name: /Vote for what your building needs/ }).click();
  await expect(page).toHaveURL("/app/polls");
});

test("orders show what was paid and what came back, and the GST invoice adds up", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your orders" })).toBeVisible();
  const festive = page.getByRole("link", { name: /Festive stock-up/ });
  await expect(festive.getByText("Paid ₹2,535")).toBeVisible();
  await expect(festive.getByText("₹65 back")).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await festive.click();
  await expect(page.getByRole("heading", { level: 1, name: "Festive stock-up" })).toBeVisible();
  await expect(page.getByText(/Collected /)).toBeVisible();
  const money = page.getByRole("region", { name: "Money" });
  await expect(money.getByText("₹2,470")).toBeVisible(); // cost in the end
  await expectNoSeriousA11yIssues(page);

  await money.getByRole("link", { name: "GST invoice" }).click();
  await expect(page).toHaveURL(/\/app\/orders\/.+\/invoice$/);
  await expect(page.getByRole("heading", { level: 1, name: "Invoice" })).toBeVisible();
  await expect(page.getByRole("article").getByText("Flat A-101, Green Meadows CHS", { exact: false })).toBeVisible();
  await expect(page.getByRole("row", { name: /^Total ₹2,470$/ })).toBeVisible();
  await expect(page.getByText(/^MLK-\d+-[A-Z0-9]{6}$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("a resident rates yesterday's visit", async ({ page }) => {
  await demoLogin(page, "Kavya Deshpande");
  await openOrder(page, "Kitchen chimney cleaning");
  const visit = page.getByRole("article").filter({ hasText: "Kitchen chimney cleaning" });
  await expect(visit.getByText("Done").first()).toBeVisible();
  await expect(visit.getByText("Code ")).toHaveCount(0); // the code is only shown until the job is done
  await expectNoSeriousA11yIssues(page);

  await visit.locator("label").filter({ hasText: "4 out of 5: Very good" }).click();
  await expect(visit.getByText("Very good", { exact: true })).toBeVisible();
  await visit.getByLabel("Anything to add? (optional)").fill("Quick and tidy.");
  await visit.getByRole("button", { name: "Send rating" }).click();
  await expect(page.getByText("Thanks for rating this visit.")).toBeVisible();
  await expect(visit.getByText("You rated it 4 out of 5")).toBeVisible();
  await expect(visit.getByRole("button", { name: "Send rating" })).toHaveCount(0);
});

test("a resident reports a problem, and the Society Manager hears about it", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await openOrder(page, "Kitchen chimney cleaning");
  const visit = page.getByRole("article").filter({ hasText: "Kitchen chimney cleaning" });
  await expect(visit.getByText(/You can report a problem until /)).toBeVisible();
  await visit.getByRole("button", { name: "Report a problem" }).click();
  const sheet = page.getByRole("dialog", { name: "Report a problem" });
  await sheet.getByLabel("What happened?").fill("The filter is still greasy and the hood wasn't wiped.");
  await sheet.getByRole("button", { name: "Send to my Society Manager" }).click();
  await expect(page.getByText("Sent. Your Society Manager will look into it.")).toBeVisible();
  await expect(visit.getByText("Your complaint")).toBeVisible();
  await expect(visit.getByText("Waiting for your Society Manager")).toBeVisible();
  await expect(visit.getByRole("button", { name: "Report a problem" })).toHaveCount(0);
  await logout(page);

  await demoLogin(page, "Sunita Kulkarni");
  await page.goto("/manager/notifications");
  await expect(page.getByText("Flat A-101: Kitchen chimney cleaning not done properly")).toBeVisible();
});

test("the wallet lists every credit and debit, linked to its order", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Wallet" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
  await expect(page.getByText("Better group price").first()).toBeVisible();
  await expect(page.getByText("Paid from your wallet").first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("link", { name: "Pre-Diwali deep cleaning" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Pre-Diwali deep cleaning" })).toBeVisible();
  // The complaint fixed by a free revisit, as the seed tells it.
  await expect(page.getByText("Free revisit", { exact: true })).toBeVisible();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
});

test("a link to a finished round opens the resident's order", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await openOrder(page, "Pre-Diwali deep cleaning");
  const orderPath = new URL(page.url()).pathname;
  const roundId = orderPath.split("/").at(-1);
  await page.goto(`/round/${roundId}`);
  await expect(page).toHaveURL(orderPath);
});

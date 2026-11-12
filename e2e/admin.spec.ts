import { expect, test } from "@playwright/test";
import { demoLogin, expectNoSeriousA11yIssues, uniquePhone } from "./helpers";

// The Platform Admin portal: queues, disputes, payouts, stats, settings and admins.
// Uses the seeded demo data (npm run db:seed) and changes it: reseed before running again.

test.beforeEach(async ({ page }) => {
  await demoLogin(page, "Priya Nair");
});

test("the overview lists what's waiting, and disputes reach the admin", async ({ page }) => {
  const queues = page.getByRole("region", { name: "Waiting for you" });
  await expect(queues.getByRole("link", { name: /Communities to approve/ })).toBeVisible();
  await expect(queues.getByRole("link", { name: /Vendors to verify/ })).toBeVisible();
  await expect(queues.getByRole("link", { name: /Payouts ready/ })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await queues.getByRole("link", { name: /Disputes/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Disputes" })).toBeVisible({ timeout: 60_000 });
  const dispute = page.getByRole("listitem").filter({ hasText: "I was home all morning" });
  await expect(dispute.getByText(/Green Meadows CHS/)).toBeVisible();
  await expect(dispute.getByRole("button", { name: /Refund/ })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("a payout is marked paid once the round can't change any more", async ({ page }) => {
  await page.goto("/admin/payouts");
  await expect(page.getByRole("heading", { level: 1, name: "Payouts" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Not ready yet" }).getByText("Bags still to hand out").first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  const ready = page.getByRole("region", { name: "Ready to pay" });
  const card = ready.getByRole("listitem").filter({ hasText: "Festive stock-up" }).first();
  const title = (await card.getByRole("heading").first().textContent())!;
  await card.getByRole("button", { name: "Mark paid" }).click();
  await page.getByRole("dialog", { name: /Mark .* payout paid\?/ }).getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText(/^Marked paid: ₹[\d,.]+\. The vendor has been told\.$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Recently paid" }).getByRole("heading", { name: title })).toBeVisible();
});

test("settings are checked and saved", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({ timeout: 60_000 });
  await expectNoSeriousA11yIssues(page);
  const margin = page.getByLabel("Milkar's margin (%)");
  await margin.fill("25");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Enter a margin between 0 and 20%.")).toBeVisible();
  await page.getByLabel("Km per vendor trip (there and back)").fill("9.5");
  await margin.fill("3");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Km per vendor trip (there and back)")).toHaveValue("9.5");
  // Put it back: other tests read the impact numbers.
  await page.getByLabel("Km per vendor trip (there and back)").fill("8");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("stats by kind of group buy, and adding another admin", async ({ page }) => {
  await page.goto("/admin/stats");
  await expect(page.getByRole("region", { name: "All group buys" }).getByText("Sales (GMV)")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Groceries" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Refunds by reason" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.goto("/admin/admins");
  await page.getByLabel("Name", { exact: true }).fill("Asha Admin");
  await page.getByLabel("Mobile number").fill(uniquePhone());
  await page.getByRole("button", { name: "Add admin" }).click();
  await expect(page.getByText("Admin added. They can log in with that number now.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Asha Admin" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

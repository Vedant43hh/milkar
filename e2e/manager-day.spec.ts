import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin, logout, uniquePhone } from "./helpers";

// A Society Manager's day: the dashboard, handing out bags, the visit board, complaints and the
// team. Uses the seeded demo data (npm run db:seed) and changes it: reseed before running again.

const MANAGER = "Sunita Kulkarni";

async function expectNoSeriousA11yIssues(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(serious).toEqual([]);
}

test("the dashboard shows the community, what's waiting and today's work", async ({ page }) => {
  await demoLogin(page, MANAGER);
  const stats = page.getByRole("region", { name: "Green Meadows CHS at a glance" });
  await expect(stats.getByText("Residents", { exact: true })).toBeVisible();
  await expect(stats.getByText("Sales this month")).toBeVisible();
  await expect(page.getByText("1 asking to join")).toBeVisible(); // Nikhil
  await expect(page.getByText("2 complaints to sort out")).toBeVisible();
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByRole("link", { name: /Hand out Weekend staples/ })).toBeVisible();
  await expect(today.getByRole("link", { name: /Carpenter Day/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Community impact" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test("distribution: the pickup code is checked, and short items are refunded at once", async ({ page }) => {
  // Kavya's pickup code, from her order.
  await demoLogin(page, "Kavya Deshpande");
  await page.goto("/app/orders");
  await page.getByRole("link", { name: /Weekend staples/ }).click();
  const code = (await page.getByText(/^Pickup code \d{4}$/).textContent())!.slice(-4);
  await logout(page);

  await demoLogin(page, MANAGER);
  await page.goto("/manager/distribution");
  await page.getByRole("link", { name: /Weekend staples/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Weekend staples" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  const bag = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Flat B-402" }) });
  await bag.getByLabel(/^Pickup code/).fill(code === "0000" ? "1111" : "0000");
  await bag.getByRole("button", { name: /Hand over/ }).click();
  await expect(page.getByText("That code doesn't match. Check the resident's phone.")).toBeVisible();
  await bag.getByLabel(/^Pickup code/).fill(code);
  await bag.getByRole("button", { name: /Hand over/ }).click();
  await expect(page.getByText("Marked as collected.")).toBeVisible();
  await expect(bag.getByText(/^Collected /)).toBeVisible();

  await bag.getByRole("button", { name: /Short or damaged\?/ }).click();
  const sheet = page.getByRole("dialog", { name: /Short or damaged items: Flat B-402/ });
  await sheet.getByLabel("Short").first().fill("1");
  await sheet.getByRole("button", { name: "Refund" }).first().click();
  await expect(page.getByText(/refunded to the resident's wallet\.$/)).toBeVisible();
});

test("the visit board shows today's carpentry by slot, and a visit can be cancelled with a full refund", async ({ page }) => {
  await demoLogin(page, MANAGER);
  await page.goto("/manager/visits");
  await page.getByRole("link", { name: /Carpenter Day/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Carpenter Day" })).toBeVisible();
  await expect(page.getByText("The wardrobe door hinge is broken; the door hangs loose.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  const row = page.getByRole("listitem").filter({ hasText: "Prakash Jadhav" }).first();
  await row.getByRole("button", { name: /Cancel visit/ }).click();
  const sheet = page.getByRole("dialog", { name: "Cancel this visit?" });
  await sheet.getByLabel("Reason (the resident will see it)").fill("The carpenter is unwell today");
  await sheet.getByRole("button", { name: "Cancel and refund" }).click();
  await expect(page.getByText("Visit cancelled and refunded.")).toBeVisible();
  await expect(page.getByText("Reason: The carpenter is unwell today")).toBeVisible();
});

test("complaints: a free revisit for one, the visit fee back for the other", async ({ page }) => {
  await demoLogin(page, MANAGER);
  await page.goto("/manager/issues");
  await expect(page.getByRole("heading", { level: 1, name: "Complaints" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  const sparks = page.getByRole("listitem").filter({ hasText: "One of the two switchboards still sparks" });
  await sparks.getByRole("button", { name: /Free revisit/ }).click();
  await page.getByRole("dialog", { name: "Book a free revisit" }).getByRole("button", { name: "Book revisit" }).click();
  await expect(page.getByText("Free revisit booked. The resident has the new code.")).toBeVisible();
  await expect(sparks.getByText("Free revisit booked")).toBeVisible();
  await expect(sparks.getByRole("button", { name: /Refund/ })).toHaveCount(0); // never both

  const dispute = page.getByRole("listitem").filter({ hasText: "I was home all morning" });
  await dispute.getByRole("button", { name: /Refund/ }).click();
  await page.getByRole("dialog", { name: "Give back the visit fee?" }).getByRole("button", { name: "Refund" }).click();
  await expect(page.getByText(/refunded to the resident's wallet\.$/)).toBeVisible();
  await expect(dispute.getByText("Refunded", { exact: true })).toBeVisible();
});

test("the Society Manager adds an assistant, who runs things but not the team", async ({ page }) => {
  const phone = uniquePhone();
  await demoLogin(page, MANAGER);
  await page.goto("/manager/team");
  await expectNoSeriousA11yIssues(page);
  await page.getByLabel("Name", { exact: true }).fill("Meera Test");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Add assistant" }).click();
  await expect(page.getByText("Assistant added. They can log in with that number now.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Meera Test" })).toBeVisible();
  await logout(page);

  await demoLogin(page, "Deepak Rao"); // an assistant
  await page.goto("/manager/team");
  await expect(page.getByText("Only the Society Manager can change the team and the community's details.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add assistant" })).toHaveCount(0);
  await expect(page.getByLabel("Community name")).toBeDisabled();
  await page.goto("/manager/residents");
  // Assistants look after residents, but can't remove someone with an order on the go.
  await page.getByRole("listitem").filter({ hasText: "Rahul Deshmukh" }).getByRole("button", { name: /Remove/ }).click();
  await page.getByRole("dialog", { name: "Remove Rahul Deshmukh?" }).getByRole("button", { name: "Remove resident" }).click();
  await expect(page.getByText("They have an order on the go. Remove them once it's delivered or done.")).toBeVisible();
  await page.keyboard.press("Escape"); // the sheet stays open after a refusal
  await logout(page);

  await demoLogin(page, MANAGER);
  await page.goto("/manager/team");
  await page.getByRole("listitem").filter({ hasText: "Meera Test" }).getByRole("button", { name: /Remove/ }).click();
  await page.getByRole("dialog", { name: "Remove Meera Test from the team?" }).getByRole("button", { name: "Remove from the team" }).click();
  await expect(page.getByText("Removed from the team.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Meera Test" })).toHaveCount(0);
});

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin, logout } from "./helpers";

// Repair Days and the technician's day. Uses the seeded demo data (npm run db:seed) and changes it:
// reseed before running the suite again. Mahesh Kale (FixRight) has three carpenter visits today:
// Kavya's (B-402), Joseph's (D-302) and Rahul's (A-101).

async function expectNoSeriousA11yIssues(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
  expect(serious).toEqual([]);
}

/** Opens a round from the resident's orders, returning its page's path. */
async function openOrder(page: Page, title: string): Promise<string> {
  await page.goto("/app/orders");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return new URL(page.url()).pathname;
}

/** The resident's 4-digit completion code for the visit on this order page. */
async function completionCode(page: Page): Promise<string> {
  const text = await page.getByText(/^Code \d{4}$/).first().textContent();
  return text!.slice(-4);
}

/** The technician opens a visit from today's list by its flat. */
async function openVisit(page: Page, flat: string) {
  await page.goto("/tech");
  await page.getByRole("link", { name: new RegExp(flat) }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Flat ${flat}` })).toBeVisible();
}

/** A tap on a step button; waits for the server's confirmation. */
async function step(page: Page, button: string, confirmation: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(page.getByText(confirmation)).toBeVisible();
}

/** The technician asks for one part. */
async function askForPart(page: Page, name: string, qty: number, price: number) {
  await page.getByRole("button", { name: "Add parts" }).click();
  const sheet = page.getByRole("dialog", { name: "Parts" });
  await sheet.getByLabel("Part", { exact: true }).fill(name);
  await sheet.getByLabel("Qty").fill(String(qty));
  await sheet.getByLabel("Price each (₹)").fill(String(price));
  await expect(sheet.getByText(`Total ₹${(qty * price).toLocaleString("en-IN")}`)).toBeVisible();
  await sheet.getByRole("button", { name: "Send to the resident" }).click();
  await expect(page.getByText("Sent. The resident has been asked to approve.")).toBeVisible();
}

/** The technician finishes with the resident's code. */
async function finishWithCode(page: Page, code: string) {
  await page.getByRole("button", { name: "Enter code" }).click();
  const sheet = page.getByRole("dialog", { name: "The resident's code" });
  await sheet.getByLabel("4-digit code").fill(code);
  await sheet.getByRole("button", { name: "Finish the visit" }).click();
}

test("repair days are listed under Repairs with the visit price falling as flats join", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/app/buys/repairs");
  const plumber = page.getByRole("link", { name: /Plumber Day/ });
  await expect(plumber.getByText("3 more flats to unlock ₹249!")).toBeVisible();
  await expect(plumber.getByText("₹299")).toBeVisible();
});

test("a technician sees today's visits with what's wrong, and only their own", async ({ page }) => {
  await demoLogin(page, "Raju Thapa");
  await page.goto("/tech/upcoming");
  const otherVisit = await page.getByRole("link", { name: /Car wash|Weekly car wash/ }).first().getAttribute("href");
  expect(otherVisit).toMatch(/^\/tech\/visits\//);
  await logout(page);

  await demoLogin(page, "Mahesh Kale");
  await expect(page.getByRole("heading", { level: 1, name: "Today's visits" })).toBeVisible();
  await expect(page.getByText("The wardrobe door hinge is broken; the door hangs loose.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Flat [A-D]-\d{3}/ })).toHaveCount(3);
  await expectNoSeriousA11yIssues(page);
  await page.goto(otherVisit!);
  await expect(page.getByText("This page could not be found.")).toBeVisible(); // another technician's visit
});

test("the technician asks for parts, the resident approves and pays, and the code finishes the visit", async ({ page }) => {
  await demoLogin(page, "Kavya Deshpande");
  const order = await openOrder(page, "Carpenter Day");
  const code = await completionCode(page);
  await logout(page);

  await demoLogin(page, "Mahesh Kale");
  await openVisit(page, "B-402");
  await expect(page.getByRole("region", { name: "What's wrong" }).getByText("The wardrobe door hinge is broken; the door hangs loose.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await step(page, "On my way", "The resident knows you're on the way.");
  await step(page, "Start the job", "Job started.");
  await askForPart(page, "Soft-close hinge", 2, 180);
  await expect(page.getByText(/Waiting for the resident to approve the parts/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter code" })).toHaveCount(0); // not while the parts wait
  const visit = new URL(page.url()).pathname;
  await logout(page);

  await demoLogin(page, "Kavya Deshpande");
  await page.goto(order);
  await expect(page.getByText("Soft-close hinge × 2")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole("button", { name: "Approve and pay ₹360" }).click();
  // Paid from the wallet at once, or on the test UPI screen for the rest.
  const toUpi = await page.waitForURL(/\/app\/pay\//, { timeout: 10_000 }).then(
    () => true,
    () => false,
  );
  if (toUpi) {
    await expect(page.getByText("Parts for Carpenter Day")).toBeVisible();
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(page).toHaveURL(order);
  }
  await expect(page.getByText("Approved and paid", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve and pay/ })).toHaveCount(0);
  await logout(page);

  await demoLogin(page, "Mahesh Kale");
  await page.goto(visit);
  await finishWithCode(page, code === "0000" ? "1111" : "0000");
  await expect(page.getByText(/That code isn't right\. 4 tries left\./)).toBeVisible();
  await page.getByRole("dialog", { name: "The resident's code" }).getByLabel("4-digit code").fill(code);
  await page.getByRole("dialog", { name: "The resident's code" }).getByRole("button", { name: "Finish the visit" }).click();
  await expect(page.getByText("Visit done. Thank you!")).toBeVisible();
  await expect(page.getByText("This visit is finished.")).toBeVisible();
});

test("a resident declines the parts and the technician finishes without them", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  const order = await openOrder(page, "Carpenter Day");
  const code = await completionCode(page);
  await logout(page);

  await demoLogin(page, "Mahesh Kale");
  await openVisit(page, "A-101");
  await step(page, "On my way", "The resident knows you're on the way.");
  await step(page, "Start the job", "Job started.");
  await askForPart(page, "Drawer runner pair", 1, 450);
  const visit = new URL(page.url()).pathname;
  await logout(page);

  await demoLogin(page, "Rahul Deshmukh");
  await page.goto(order);
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page.getByRole("dialog", { name: "Decline these parts?" }).getByRole("button", { name: "Decline parts" }).click();
  await expect(page.getByText("Parts declined. The technician will carry on without them.")).toBeVisible();
  await expect(page.getByText("Declined", { exact: true })).toBeVisible();
  await logout(page);

  await demoLogin(page, "Mahesh Kale");
  await page.goto(visit);
  await finishWithCode(page, code);
  await expect(page.getByText("Visit done. Thank you!")).toBeVisible();
});

test("a technician who can't get in marks it, and the resident's money minus the fee goes back", async ({ page }) => {
  await demoLogin(page, "Mahesh Kale");
  await openVisit(page, "D-302");
  await step(page, "On my way", "The resident knows you're on the way.");
  await page.getByRole("button", { name: "Couldn't get in" }).click();
  await page.getByRole("dialog", { name: "Couldn't get in?" }).getByRole("button", { name: "Yes, I couldn't get in" }).click();
  await expect(page.getByText("Marked as couldn't get in. The resident has been told.")).toBeVisible();
  await expect(page.getByText("Couldn't get in", { exact: true }).first()).toBeVisible(); // the visit's status
});

test("a resident books a Plumber Day and describes the problem with a photo only the right people see", async ({ page }) => {
  await demoLogin(page, "Rahul Deshmukh");
  await page.goto("/app/buys/repairs");
  await page.getByRole("link", { name: /Plumber Day/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plumber Day" })).toBeVisible();
  await page.getByRole("button", { name: "Add Visit & labour" }).click();
  await page.locator("label", { has: page.getByRole("radio", { disabled: false }) }).first().click();
  await page.getByRole("button", { name: /^Review changes/ }).click();
  const sheet = page.getByRole("dialog", { name: "Your changes" });
  const pay = sheet.getByRole("button", { name: /^(Pay ₹[\d,]+ with UPI|Confirm changes)$/ });
  await expect(pay).toBeVisible({ timeout: 30_000 });
  const viaUpi = (await pay.textContent())?.startsWith("Pay") ?? false;
  await pay.click();
  if (viaUpi) {
    await expect(page).toHaveURL(/\/pay\//, { timeout: 30_000 });
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
  }
  await expect(page).toHaveURL(/\/services\/[\w-]+$/, { timeout: 30_000 });

  const problem = page.getByRole("region", { name: "What's wrong?" });
  await expect(problem).toBeVisible();
  await problem.getByLabel("Describe the problem").fill("The kitchen tap leaks at the base.");
  // A tiny real PNG: the phone turns it into a small JPEG before sending.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
  await problem.getByLabel("Add a photo (optional)").setInputFiles({ name: "tap.png", mimeType: "image/png", buffer: png });
  await expect(problem.getByRole("img", { name: "Photo of the problem" })).toBeVisible();
  await problem.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The technician will see it.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.reload();
  const src = await page.getByRole("region", { name: "What's wrong?" }).getByRole("img", { name: "Photo of the problem" }).getAttribute("src");
  const photo = decodeURIComponent(src!).match(/\/api\/photos\/[\w-]+/)![0];
  const mine = await page.request.get(photo);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-type"]).toBe("image/jpeg");
  await logout(page);

  // Another flat, and a technician not on this visit, get nothing; the community's manager can see it.
  for (const [who, status] of [["Kavya Deshpande", 404], ["Mahesh Kale", 404], ["Sunita Kulkarni", 200]] as const) {
    await demoLogin(page, who);
    expect((await page.request.get(photo)).status(), who).toBe(status);
    await logout(page);
  }
});

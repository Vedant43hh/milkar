import { expect, test, type Page } from "@playwright/test";
import { demoLogin, expectNoSeriousA11yIssues, loginWithOtp, logout, nextStep, uniquePhone, verifyPhoneAndSubmit } from "./helpers";

// The whole story on a 360×800 phone, start to finish:
//   1. a visitor reads the landing page and plays with the price simulator;
//   2. registers as a resident of Green Meadows, Flat C-302 (no seeded household lives there);
//   3. the Society Manager approves them;
//   4. they buy the packs that unlock a better grocery price, and book a Plumber Day slot with a note;
//   5. the manager closes both, so prices are final and a technician is assigned;
//   6. the technician sets out, starts, asks for a part; the resident approves and pays (wallet
//      first); the resident's code finishes the visit;
//   7. wallet, orders, invoices and the home page's savings all tell the same story.
//
// It closes this week's grocery round and the Plumber Day, which the other tests expect open, so
// it runs last as its own project (see playwright.config.ts). Reseed before running it again.

const dev = process.env.E2E_DEV === "1";
const FLAT = "C-302";
const PART = { name: "Tap cartridge", qty: 1, price: 150 };

/** "₹1,234" → 1234. Prices here are whole rupees. */
function rupees(text: string): number {
  const value = Number(text.replace(/[₹,\s]/g, ""));
  expect(Number.isInteger(value), `whole rupees in "${text}"`).toBe(true);
  return value;
}
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const exactly = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

/** The test UPI screen, if the checkout went there; returns whether it did. */
async function payOnUpiIfAsked(page: Page): Promise<boolean> {
  const toUpi = await page.waitForURL(/\/app\/pay\//, { timeout: dev ? 30_000 : 10_000 }).then(
    () => true,
    () => false,
  );
  if (toUpi) await page.getByRole("button", { name: /^Pay ₹/ }).click();
  return toUpi;
}

/** Logs in by phone and waits until the app has let them in. */
async function signIn(page: Page, phone: string) {
  await page.goto("/login");
  await loginWithOtp(page, phone);
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
}

async function closeRound(page: Page) {
  await page.getByRole("button", { name: "Close now" }).click();
  await page.getByRole("dialog", { name: "Close orders now?" }).getByRole("button", { name: "Close orders now" }).click();
  await expect(page.getByText(/^Orders closed and finalized\./)).toBeVisible({ timeout: 60_000 });
}

test("golden path: from the landing page to a finished repair, with every number agreeing", async ({ page, browser }, testInfo) => {
  test.setTimeout(dev ? 1_800_000 : 600_000);
  // Everyone on their own phone, each logged in once (codes by SMS are rate-limited per number):
  // the resident on `page`, the manager and the vendor on `staff`, the technician on `tech`.
  const { baseURL, viewport, userAgent, deviceScaleFactor, hasTouch, isMobile } = testInfo.project.use;
  const phoneScreen = async () => (await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, hasTouch, isMobile })).newPage();
  const staff = await phoneScreen();
  const tech = await phoneScreen();
  const phone = uniquePhone();
  const name = `Golden Path${String(Date.now()).slice(-5)}`;

  // 1. The landing page and the simulator.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Your building buys together. Everyone pays less." })).toBeVisible();
  const slider = page.getByLabel("Flats joining");
  await slider.fill("30");
  await expect(page.getByText("20 more flats to unlock ₹2,400").first()).toBeVisible();
  await slider.fill("50");
  await expect(page.getByText("Best price reached").first()).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // 2. Register as a resident.
  await page.getByRole("link", { name: "Register as a resident" }).click();
  await expect(page).toHaveURL("/register?role=resident");
  await page.getByLabel("Invite code").fill("greenmdw");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText("Green Meadows CHS, Pune")).toBeVisible();
  await nextStep(page);
  await page.getByLabel("Tower", { exact: true }).selectOption("C");
  await page.getByLabel("Flat number").selectOption({ label: "302" });
  await nextStep(page);
  await page.getByLabel("Your name").fill(name);
  await nextStep(page);
  await verifyPhoneAndSubmit(page, phone, "Send my request");
  await expect(page).toHaveURL("/app/join", { timeout: 60_000 });
  await expect(page.getByText(`You asked to join Green Meadows CHS as Flat ${FLAT}`, { exact: false })).toBeVisible();

  // 3. The Society Manager approves, and the resident is in.
  await demoLogin(staff, "Sunita Kulkarni");
  await staff.goto("/manager/residents");
  await staff.getByRole("listitem").filter({ hasText: name }).getByRole("button", { name: "Approve" }).click();
  await expect(staff.getByText("Approved. They're in.")).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL("/app");
  const tour = page.getByRole("dialog", { name: "Getting started" });
  await tour.getByRole("button", { name: "Skip" }).click();
  await expect(tour).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Namaste, Golden" })).toBeVisible();

  // 4a. Groceries: the product closest to its next price takes exactly the packs it needs.
  await page.goto("/app/groceries");
  await expect(page.getByRole("heading", { level: 1, name: "Groceries" })).toBeVisible();
  const cards = page.getByRole("listitem").filter({ visible: true }).filter({ hasText: /more .+ to unlock ₹/ });
  let pick: { product: string; needed: number; newPrice: number; mrp: number } | null = null;
  for (const card of await cards.all()) {
    const match = /(\d+) more .+? to unlock (₹[\d,]+)!/.exec((await card.textContent()) ?? "");
    if (!match || (pick && Number(match[1]) >= pick.needed)) continue;
    pick = {
      product: (await card.locator("p").first().textContent())!.trim(),
      needed: Number(match[1]),
      newPrice: rupees(match[2]),
      mrp: rupees((await card.locator("s").first().textContent())!),
    };
  }
  expect(pick, "a product a few packs away from a better price").not.toBeNull();
  const grocery = pick!;
  expect(grocery.needed).toBeLessThanOrEqual(3);
  const card = page.getByRole("listitem").filter({ visible: true }).filter({ has: page.locator("p", { hasText: exactly(grocery.product) }) });
  for (let i = 0; i < grocery.needed; i++) await card.getByRole("button", { name: /^(Add|One more) / }).click();
  await page.getByRole("button", { name: /^Review changes/ }).click();
  const groceryPay = page.getByRole("dialog", { name: "Your changes" }).getByRole("button", { name: /^Pay ₹[\d,]+ with UPI$/ });
  await expect(groceryPay).toBeVisible({ timeout: 30_000 }); // a new resident's wallet is empty
  const groceryPaid = rupees(/₹[\d,]+/.exec((await groceryPay.textContent())!)![0]);
  const oldPrice = groceryPaid / grocery.needed; // charged at the price before this order
  expect(oldPrice).toBeGreaterThan(grocery.newPrice);
  await groceryPay.click();
  expect(await payOnUpiIfAsked(page)).toBe(true);
  await expect(page).toHaveURL(/\/groceries\?round=/, { timeout: 30_000 });
  const groceryRound = new URL(page.url()).searchParams.get("round")!;

  // 5. A tier unlocks for everyone.
  await expect(page.getByText(`🎉 Price unlocked! Everyone now pays ${inr(grocery.newPrice)} for ${grocery.product}`)).toBeVisible({ timeout: 30_000 });

  // 4b. A Plumber Day visit, with what's wrong.
  await page.goto("/app/buys/repairs");
  await page.getByRole("link", { name: /Plumber Day/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plumber Day" })).toBeVisible();
  const visitOption = page.getByRole("listitem").filter({ visible: true }).filter({ hasText: "Visit & labour" }).first();
  const visitMrp = rupees((await visitOption.locator("s").first().textContent())!);
  await page.getByRole("button", { name: "Add Visit & labour" }).click();
  await page.locator("label", { has: page.getByRole("radio", { disabled: false }) }).first().click();
  await page.getByRole("button", { name: /^Review changes/ }).click();
  const visitPay = page.getByRole("dialog", { name: "Your changes" }).getByRole("button", { name: /^Pay ₹[\d,]+ with UPI$/ });
  await expect(visitPay).toBeVisible({ timeout: 30_000 });
  const visitPrice = rupees(/₹[\d,]+/.exec((await visitPay.textContent())!)![0]);
  await visitPay.click();
  expect(await payOnUpiIfAsked(page)).toBe(true);
  await expect(page).toHaveURL(/\/services\/[\w-]+$/, { timeout: 30_000 });
  const problem = page.getByRole("region", { name: "What's wrong?" });
  await problem.getByLabel("Describe the problem").fill("The kitchen tap drips and the cartridge feels loose.");
  await problem.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The technician will see it.")).toBeVisible();

  // 6. The manager closes this week's groceries and the Plumber Day.
  await staff.goto(`/manager/rounds/${groceryRound}`);
  await closeRound(staff);
  await staff.goto("/manager/rounds");
  await staff.getByRole("link", { name: /Plumber Day/ }).first().click();
  await closeRound(staff);
  await logout(staff);

  // The resident sees who is coming, and their code.
  await page.goto("/app/orders");
  await page.getByRole("link", { name: /Plumber Day/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Plumber Day" })).toBeVisible();
  const plumberOrder = new URL(page.url()).pathname;
  expect(plumberOrder).toMatch(/^\/app\/orders\/[\w-]+$/);
  const technician = (await page.getByText(/^Technician: /).first().textContent())!.replace("Technician: ", "").trim();
  const code = (await page.getByText(/^Code \d{4}$/).first().textContent())!.slice(-4);

  // The vendor's team list has the technician's number, so the test can log in as them.
  await demoLogin(staff, "Sameer Kulkarni");
  await staff.goto("/vendor/technicians");
  const techRow = staff.getByRole("listitem").filter({ hasText: technician });
  const techPhone = /\+91 (\d{5}) (\d{5})/.exec((await techRow.textContent())!)!;

  // 7. On the way, started, a part asked for.
  await signIn(tech, `${techPhone[1]}${techPhone[2]}`);
  await tech.goto("/tech/upcoming");
  await tech.getByRole("link", { name: new RegExp(FLAT) }).first().click();
  await expect(tech.getByRole("heading", { level: 1, name: `Flat ${FLAT}` })).toBeVisible();
  await expect(tech.getByRole("region", { name: "What's wrong" }).getByText("The kitchen tap drips and the cartridge feels loose.")).toBeVisible();
  await tech.getByRole("button", { name: "On my way", exact: true }).click();
  await expect(tech.getByText("The resident knows you're on the way.")).toBeVisible();
  await tech.getByRole("button", { name: "Start the job", exact: true }).click();
  await expect(tech.getByText("Job started.")).toBeVisible();
  await tech.getByRole("button", { name: "Add parts" }).click();
  const parts = tech.getByRole("dialog", { name: "Parts" });
  await parts.getByLabel("Part", { exact: true }).fill(PART.name);
  await parts.getByLabel("Qty").fill(String(PART.qty));
  await parts.getByLabel("Price each (₹)").fill(String(PART.price));
  await parts.getByRole("button", { name: "Send to the resident" }).click();
  await expect(tech.getByText("Sent. The resident has been asked to approve.")).toBeVisible();
  const visitPage = new URL(tech.url()).pathname;

  // The resident approves and pays: the better-price refund in the wallet goes first.
  const partsTotal = PART.qty * PART.price;
  const tierRefund = grocery.needed * (oldPrice - grocery.newPrice);
  const fromWallet = Math.min(tierRefund, partsTotal);
  await page.goto(plumberOrder);
  await page.getByRole("button", { name: `Approve and pay ${inr(partsTotal)}` }).click();
  expect(await payOnUpiIfAsked(page)).toBe(fromWallet < partsTotal);
  await expect(page).toHaveURL(plumberOrder, { timeout: 30_000 });
  await expect(page.getByText("Approved and paid", { exact: true })).toBeVisible();

  // The resident's code finishes the visit.
  await tech.goto(visitPage);
  await tech.getByRole("button", { name: "Enter code" }).click();
  const codeSheet = tech.getByRole("dialog", { name: "The resident's code" });
  await codeSheet.getByLabel("4-digit code").fill(code);
  await codeSheet.getByRole("button", { name: "Finish the visit" }).click();
  await expect(tech.getByText("Visit done. Thank you!")).toBeVisible();

  // 8. Every number agrees.
  const balance = tierRefund - fromWallet;

  await page.goto("/app/wallet");
  await expect(page.getByText(exactly(inr(balance))).first()).toBeVisible();
  const refundEntry = page.getByRole("listitem").filter({ hasText: "Better group price" });
  await expect(refundEntry).toHaveCount(1);
  await expect(refundEntry.getByText(`+${inr(tierRefund)}`)).toBeVisible();
  if (fromWallet > 0) await expect(page.getByRole("listitem").filter({ hasText: "Parts paid from your wallet" }).getByText(`−${inr(fromWallet)}`)).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.goto(`/app/orders/${groceryRound}`);
  const money = page.getByRole("region", { name: "Money" });
  await expect(money.getByText(inr(groceryPaid)).first()).toBeVisible(); // paid
  await expect(money.getByText(inr(tierRefund)).first()).toBeVisible(); // back to the wallet
  await expect(money.getByText(inr(grocery.needed * grocery.newPrice)).first()).toBeVisible(); // cost in the end
  await money.getByRole("link", { name: "GST invoice" }).click();
  await expect(page.getByRole("row", { name: exactly(`Total ${inr(grocery.needed * grocery.newPrice)}`) })).toBeVisible();

  await page.goto(plumberOrder);
  await expect(page.getByText("Done").first()).toBeVisible();
  await page.getByRole("region", { name: "Money" }).getByRole("link", { name: "GST invoice" }).click();
  await expect(page.getByText(`Part: ${PART.name}`)).toBeVisible();
  await expect(page.getByRole("row", { name: exactly(`Total ${inr(visitPrice + partsTotal)}`) })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  // Home: savings against MRP for both confirmed orders, and the wallet tile.
  const saved = grocery.needed * (grocery.mrp - grocery.newPrice) + Math.max(0, visitMrp - visitPrice);
  await page.goto("/app");
  await expect(page.getByText("Saved this month").filter({ visible: true }).locator("..")).toContainText(inr(saved));
  await expect(page.getByRole("link", { name: /Wallet/ }).filter({ visible: true }).filter({ hasText: exactly(`Wallet${inr(balance)}Refunds and credits`) })).toBeVisible();
  await expect(page.getByRole("region", { name: "Community impact" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await staff.context().close();
  await tech.context().close();
});

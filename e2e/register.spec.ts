import { expect, test, type Page } from "@playwright/test";
import { demoLogin, loginWithOtp, logout, nextStep, uniquePhone, verifyPhoneAndSubmit } from "./helpers";

// Registering each kind of account, and the approval that lets it in. Every test registers
// fresh accounts, so the seeded demo data stays as it was.

const suffix = () => String(Date.now()).slice(-5);

/** The first-login tour appears once; skipping it saves that it was seen. */
async function skipTour(page: Page) {
  const tour = page.getByRole("dialog", { name: "Getting started" });
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Skip" }).click();
  await expect(tour).toBeHidden();
}

/** The list item (a request, a community, a vendor) that mentions `text`. */
const itemWith = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

test.describe("landing and welcome", () => {
  test("the simulator shows the price dropping as flats join", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Your building buys together. Everyone pays less." })).toBeVisible();
    const slider = page.getByLabel("Flats joining");
    await slider.fill("30");
    await expect(page.getByText("20 more flats to unlock ₹2,400").first()).toBeVisible();
    await slider.fill("50");
    await expect(page.getByText("Best price reached").first()).toBeVisible();
    await expect(page.getByText("₹2,400").first()).toBeVisible();
    await expect(page.getByText(/^Example:/)).toBeVisible(); // the numbers are labelled as an example
  });

  test("role cards on the landing page open registration with that role", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Register my business" }).click();
    await expect(page).toHaveURL("/register?role=vendor");
    await expect(page.getByLabel("Business name")).toBeVisible();
  });

  test("welcome asks whether you're new or already have an account", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome to Milkar" })).toBeVisible();
    await page.getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL("/register");
    await page.goto("/welcome");
    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL("/login");
  });

  test("admin accounts are never offered, even when asked for in the link", async ({ page }) => {
    await page.goto("/register?role=admin");
    await expect(page.getByRole("heading", { level: 1, name: "How will you use Milkar?" })).toBeVisible();
    await expect(page.locator('main a[href^="/register?role="]')).toHaveCount(3); // resident, manager, vendor
    await expect(page.locator('a[href*="role=admin"]')).toHaveCount(0);
    await expect(page.getByText(/admin/i)).toHaveCount(0);
  });
});

test("a resident registers, the Society Manager approves, and they're in", async ({ page }) => {
  const phone = uniquePhone();
  const name = `Asha Test${suffix()}`;

  await page.goto("/register?role=resident");
  await page.getByLabel("Invite code").fill("greenmdw");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText("Green Meadows CHS, Pune")).toBeVisible();
  await nextStep(page);
  await page.getByLabel("Tower", { exact: true }).selectOption("B");
  await page.getByLabel("Flat number").selectOption({ label: "201" });
  await nextStep(page);
  await page.getByLabel("Your name").fill(name);
  await nextStep(page);
  await verifyPhoneAndSubmit(page, phone, "Send my request");

  await expect(page).toHaveURL("/app/join", { timeout: 60_000 });
  await expect(page.getByText("Waiting for your Society Manager")).toBeVisible();
  await expect(page.getByText(/You asked to join Green Meadows CHS as Flat B-201/)).toBeVisible();
  await logout(page);

  await demoLogin(page, "Sunita Kulkarni");
  await page.goto("/manager/residents");
  await itemWith(page, name).getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved. They're in.")).toBeVisible();
  await expect(itemWith(page, name)).toHaveCount(1); // now in the member list, not the queue
  await logout(page);

  await loginWithOtp(page, phone);
  await expect(page).toHaveURL("/app");
  await skipTour(page);
  await expect(page.getByRole("heading", { level: 1, name: "Namaste, Asha" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Getting started" })).toHaveCount(0); // seen once, never again
});

test("a declined resident sees the reason and can ask again", async ({ page }) => {
  const phone = uniquePhone();
  const name = `Ravi Test${suffix()}`;
  await page.goto("/join/GREENMDW");
  await nextStep(page);
  await page.getByLabel("Tower", { exact: true }).selectOption("A");
  await page.getByLabel("Flat number").selectOption({ label: "102" });
  await nextStep(page);
  await page.getByLabel("Your name").fill(name);
  await nextStep(page);
  await verifyPhoneAndSubmit(page, phone, "Send my request");
  await expect(page).toHaveURL("/app/join", { timeout: 60_000 });
  await logout(page);

  await demoLogin(page, "Sunita Kulkarni");
  await page.goto("/manager/residents");
  await itemWith(page, name).getByRole("button", { name: "Decline" }).click();
  const sheet = page.getByRole("dialog", { name: `Decline ${name}?` });
  await sheet.getByLabel("Reason (optional, they'll see it)").fill("Please use the flat on your agreement");
  await sheet.getByRole("button", { name: "Decline request" }).click();
  await expect(page.getByText("Request declined")).toBeVisible();
  await logout(page);

  await loginWithOtp(page, phone);
  await expect(page).toHaveURL("/app/join");
  await expect(page.getByText("Your request wasn't approved")).toBeVisible();
  await expect(page.getByText(/Your Society Manager said: Please use the flat on your agreement/)).toBeVisible();
  // Asking again starts from the same community.
  await expect(page.getByText("Green Meadows CHS, Pune")).toBeVisible();
  await page.getByLabel("Tower", { exact: true }).selectOption("A");
  await page.getByLabel("Flat number").selectOption({ label: "201" });
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(page.getByText("Waiting for your Society Manager")).toBeVisible();
  await expect(page.getByText(/as Flat A-201/)).toBeVisible();
});

test("a Society Manager registers a community, the admin approves it, and the portal opens", async ({ page }) => {
  const phone = uniquePhone();
  const community = `Test Heights ${suffix()}`;

  await page.goto("/register?role=manager");
  await page.getByLabel("Community name").fill(community);
  await page.getByLabel("What kind of place is it?").selectOption({ label: "Apartment society" });
  await nextStep(page);
  await page.getByLabel("Address").fill("12 Test Road, Baner");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("Pincode").fill("411045");
  await nextStep(page);
  await expect(page.getByText("40 homes, numbered A-101 to D-502")).toBeVisible(); // A-D, 5 floors, 2 a floor
  await page.getByLabel("Floors").fill("60");
  await page.getByLabel("Homes per floor").fill("20"); // 4 × 60 × 20 = 4,800: more than 2,000
  await nextStep(page);
  await expect(page.getByRole("alert").filter({ hasText: "Check the building names" })).toBeVisible();
  await page.getByLabel("Floors").fill("5");
  await page.getByLabel("Homes per floor").fill("2");
  await nextStep(page);
  await page.getByLabel("Your name").fill("Meena Test");
  await nextStep(page);
  await verifyPhoneAndSubmit(page, phone, "Register my community");

  await expect(page).toHaveURL("/manager/pending", { timeout: 60_000 });
  await expect(page.getByText("Waiting for approval")).toBeVisible();
  await logout(page);

  await demoLogin(page, "Priya Nair");
  await page.goto("/admin/communities");
  const item = itemWith(page, community);
  await expect(item.getByText(/40 homes · Pune 411045/)).toBeVisible();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved. The Society Manager has been told.")).toBeVisible();
  await logout(page);

  await loginWithOtp(page, phone);
  await expect(page).toHaveURL("/manager");
  await skipTour(page);
  await expect(page.getByRole("heading", { level: 1, name: "Society Manager" })).toBeVisible();
  await page.goto("/manager/residents");
  await expect(page.getByText(/^Invite code: [A-Z0-9]+$/)).toBeVisible();
});

test("a vendor registers, sees the checklist, and is verified by the admin", async ({ page }) => {
  const phone = uniquePhone();
  const business = `FixFast Repairs ${suffix()}`;

  await page.goto("/register?role=vendor");
  await page.getByLabel("Business name").fill(business);
  await page.getByLabel("City").fill("Pune");
  await nextStep(page);
  await expect(page.getByRole("alert").filter({ hasText: "Choose at least one." })).toBeVisible();
  await page.getByLabel("Repairs").check();
  await nextStep(page);
  await page.getByLabel("Service-area pincodes").fill("411045, 411057");
  await page.getByLabel("GSTIN (optional)").fill("27ABCDE1234F1Z9"); // wrong check digit
  await nextStep(page);
  await expect(page.getByRole("alert").filter({ hasText: "That GSTIN doesn't look right" })).toBeVisible();
  await page.getByLabel("GSTIN (optional)").fill("");
  await nextStep(page);
  await page.getByLabel("Your name").fill("Farhan Test");
  await nextStep(page);
  await verifyPhoneAndSubmit(page, phone, "Register my business");

  await expect(page).toHaveURL("/vendor", { timeout: 60_000 });
  await skipTour(page);
  await expect(page.getByText("Getting verified")).toBeVisible();
  await expect(page.getByText("Milkar's review")).toBeVisible();
  await logout(page);

  await demoLogin(page, "Priya Nair");
  await page.goto("/admin/vendors");
  const item = itemWith(page, business);
  await expect(item.getByText("Works in 411045, 411057")).toBeVisible();
  await expect(item.getByText("No GSTIN given")).toBeVisible();
  await item.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("Verified. They've been told.")).toBeVisible();
  await logout(page);

  await loginWithOtp(page, phone);
  await expect(page).toHaveURL("/vendor");
  await expect(page.getByText("You're verified")).toBeVisible();
});

test("a vendor adds a technician, who logs in to the technician portal", async ({ page }) => {
  const techPhone = uniquePhone();
  const techName = `Sunil Test${suffix()}`;
  await demoLogin(page, "Suresh Pillai");
  await page.goto("/vendor/technicians");
  await page.getByLabel("Name", { exact: true }).fill(techName);
  await page.getByLabel("Mobile number").fill(techPhone);
  await page.getByRole("button", { name: "Add technician" }).click();
  await expect(page.getByText("Technician added. They can log in with that number now.")).toBeVisible();
  await expect(itemWith(page, techName)).toBeVisible();
  await logout(page);

  await loginWithOtp(page, techPhone);
  await expect(page).toHaveURL("/tech");
  await skipTour(page);
  await expect(page.getByRole("heading", { level: 1, name: "Today's visits" })).toBeVisible();
});

test("a number that's already registered can't register again", async ({ page }) => {
  await page.goto("/register?role=vendor");
  await page.getByLabel("Business name").fill("Duplicate Test");
  await page.getByLabel("Groceries").check();
  await page.getByLabel("City").fill("Pune");
  await nextStep(page);
  await page.getByLabel("Service-area pincodes").fill("411045");
  await nextStep(page);
  await page.getByLabel("Your name").fill("Rahul Again");
  await nextStep(page);
  await page.getByLabel("Mobile number").fill("9000000003"); // Rahul, a demo resident
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("This number already has a Milkar account. Log in instead.")).toBeVisible();
});

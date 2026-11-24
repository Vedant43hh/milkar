import { expect, test, type Page } from "@playwright/test";
import { demoLogin, expectNoSeriousA11yIssues } from "./helpers";

// Every main page of every portal, at 360×800: tap targets of at least 44 px, and no serious
// accessibility problem in the light or the dark theme.
const PORTALS = [
  { who: "Rahul Deshmukh", pages: ["/app", "/app/buys", "/app/groceries", "/app/services", "/app/orders", "/app/wallet", "/app/subscriptions", "/app/polls", "/app/notifications"] },
  { who: "Sunita Kulkarni", pages: ["/manager", "/manager/rounds", "/manager/distribution", "/manager/visits", "/manager/issues", "/manager/residents", "/manager/polls", "/manager/team"] },
  { who: "Manoj Yadav", pages: ["/vendor", "/vendor/orders", "/vendor/schedule", "/vendor/catalogue", "/vendor/technicians", "/vendor/earnings", "/vendor/profile"] },
  { who: "Mahesh Kale", pages: ["/tech", "/tech/upcoming", "/tech/me"] },
  { who: "Priya Nair", pages: ["/admin", "/admin/communities", "/admin/vendors", "/admin/disputes", "/admin/payouts", "/admin/stats", "/admin/settings", "/admin/admins"] },
];
const PUBLIC_PAGES = ["/", "/welcome", "/login", "/register"];

/**
 * Visible controls smaller than 44×44 px, described for the failure message. Links inside a
 * sentence are exempt (WCAG 2.5.8's inline exception); a visually hidden checkbox or radio is
 * measured by its label, which is what a finger actually taps.
 */
async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const MIN = 44 - 0.5;
    const controls = document.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"]',
    );
    const small: string[] = [];
    for (const control of controls) {
      if (!control.checkVisibility({ visibilityProperty: true, opacityProperty: false })) continue;
      if (control.closest("[hidden], [inert], [aria-hidden='true']")) continue;
      let target: HTMLElement = control;
      let rect = control.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) {
        // Visually hidden: a choice input is tapped through its label; a skip link only shows on focus.
        const label = control instanceof HTMLInputElement ? (control.labels?.[0] ?? null) : null;
        if (!label) continue;
        target = label;
        rect = label.getBoundingClientRect();
      }
      const inline = getComputedStyle(target).display === "inline" && target.closest("p, li, dd, td") !== null;
      if (inline) continue;
      if (rect.width < MIN || rect.height < MIN) {
        const name = (target.getAttribute("aria-label") ?? target.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        small.push(`${target.tagName.toLowerCase()} "${name}" ${Math.round(rect.width)}×${Math.round(rect.height)}`);
      }
    }
    return [...new Set(small)];
  });
}

async function checkPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("h1").filter({ visible: true }).first()).toBeVisible();
  expect.soft(await smallTapTargets(page), `small tap targets on ${path}`).toEqual([]);
  await expectNoSeriousA11yIssues(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoSeriousA11yIssues(page);
  await page.emulateMedia({ colorScheme: "light" });
}

test("public pages: tap targets and accessibility in both themes", async ({ page }) => {
  for (const path of PUBLIC_PAGES) await checkPage(page, path);
});

for (const { who, pages } of PORTALS) {
  test(`${who}'s portal: tap targets and accessibility in both themes`, async ({ page }) => {
    test.setTimeout(pages.length * 20_000);
    await demoLogin(page, who);
    for (const path of pages) await checkPage(page, path);
  });
}

test("the app installs: manifest, icons and the offline page", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Milkar", start_url: "/login", display: "standalone" });
  for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);

  // Visitors without an account get the offline page itself, not the login page.
  const offline = await request.get("/offline.html", { maxRedirects: 0 });
  expect(offline.status()).toBe(200);
  await page.goto("/offline.html");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  expect(await smallTapTargets(page)).toEqual([]);
  await expectNoSeriousA11yIssues(page);
});

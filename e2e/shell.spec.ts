import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { demoLogin } from "./helpers";

test.describe("resident shell", () => {
  test("bottom tabs move between sections on phones", async ({ page }) => {
    await demoLogin(page, "Rahul Deshmukh");
    const tabs = page.getByRole("navigation", { name: "Main" });
    const stops: [tab: string, path: string, heading: string][] = [
      ["Group buys", "/app/buys", "Group buys"],
      ["Orders", "/app/orders", "Your orders"],
      ["Wallet", "/app/wallet", "Wallet"],
      ["Home", "/app", "Namaste, Rahul"],
    ];
    for (const [tab, path, heading] of stops) {
      await tabs.getByRole("link", { name: tab }).click();
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(tabs.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
    }
  });

  test("desktop uses a side nav instead of the tab bar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await demoLogin(page, "Rahul Deshmukh");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toHaveCount(1); // the bottom bar is hidden, not just covered
    await nav.getByRole("link", { name: "Wallet" }).click();
    await expect(page).toHaveURL("/app/wallet");
    await expect(page.getByText("Green Meadows CHS").first()).toBeVisible(); // community name in the top bar
  });

  test("the notification bell opens the notification centre", async ({ page }) => {
    await demoLogin(page, "Rahul Deshmukh");
    await page.getByRole("link", { name: "Notifications" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
  });
});

test.describe("theme", () => {
  test("a dark choice applies at once and survives reloads", async ({ page }) => {
    await demoLogin(page, "Rahul Deshmukh");
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("dialog").getByText("Dark", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("dialog").getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test.describe("with a dark system setting", () => {
    test.use({ colorScheme: "dark" });
    test("follows the system by default", async ({ page }) => {
      await page.goto("/login");
      await expect(page.locator("html")).toHaveClass(/dark/);
    });
  });
});

test("staff areas use a menu sheet on phones", async ({ page }) => {
  await demoLogin(page, "Sunita Kulkarni");
  await page.goto("/manager");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Society Manager" });
  await expect(menu.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByText("Interest polls")).toBeVisible();
});

// Pages to check, with the demo user to log in as (null = signed out). None of them redirect.
const PAGES: [path: string, user: string | null][] = [
  ["/", null],
  ["/welcome", null],
  ["/login", null],
  ["/register", null],
  ["/register?role=resident&code=GREENMDW", null], // where an invite link lands
  ["/register?role=manager", null],
  ["/register?role=vendor", null],
  ["/design", null],
  ["/app/join", "Nikhil Bhosale"],
  ["/app", "Rahul Deshmukh"],
  ["/app/buys", "Rahul Deshmukh"],
  ["/app/groceries", "Rahul Deshmukh"],
  ["/app/notifications", "Rahul Deshmukh"],
  ["/app/polls", "Rahul Deshmukh"],
  ["/app/polls/suggest", "Rahul Deshmukh"],
  ["/app/services", "Rahul Deshmukh"],
  ["/manager", "Sunita Kulkarni"],
  ["/manager/rounds", "Sunita Kulkarni"],
  ["/manager/polls", "Sunita Kulkarni"],
  ["/manager/rounds/new/service", "Sunita Kulkarni"],
  ["/manager/notifications", "Sunita Kulkarni"],
  ["/manager/residents", "Sunita Kulkarni"],
  ["/manager/pending", "Anil Kapoor"],
  ["/tech", "Raju Thapa"],
  ["/tech/upcoming", "Raju Thapa"],
  ["/vendor", "Ramesh Agarwal"],
  ["/vendor/notifications", "Manoj Yadav"],
  ["/vendor/technicians", "Suresh Pillai"],
  ["/admin", "Priya Nair"],
  ["/admin/communities", "Priya Nair"],
  ["/admin/vendors", "Priya Nair"],
];

async function visitAs(page: Page, path: string, user: string | null) {
  await page.context().clearCookies();
  if (user) await demoLogin(page, user);
}

test("reload-loop guard: each page loads exactly once", async ({ page }) => {
  test.setTimeout(600_000);
  for (const [path, user] of PAGES) {
    await visitAs(page, path, user);
    // Count real document loads (not same-document history updates the router makes).
    let navigations = 0;
    const count = (request: import("@playwright/test").Request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
    };
    page.on("request", count);
    await page.goto(path);
    await page.waitForTimeout(3000);
    page.off("request", count);
    expect(navigations, `${path} navigated ${navigations} times in 3s`).toBe(1);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`no serious accessibility problems (${scheme} theme)`, async ({ page }) => {
    test.setTimeout(600_000);
    // Reduced motion: no fade-in mid-scan (axe would measure half-transparent text).
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    const problems: { page: string; rule: string; help: string; nodes: string[] }[] = [];
    for (const [path, user] of PAGES) {
      await visitAs(page, path, user);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // nextjs-portal is the framework's dev-tools overlay (dev mode only), not our UI.
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
      for (const v of results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) {
        problems.push({ page: path, rule: v.id, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) });
      }
    }
    expect(problems, `accessibility problems (${scheme})`).toEqual([]);
  });
}

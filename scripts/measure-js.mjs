// Reports how much JavaScript key pages download (compressed bytes over the wire).
// "JS (KB)" is what the page itself needs. "+ prefetch (KB)" adds what Next loads ahead of time
// for links on screen (their data and scripts), so following them is instant.
// Usage: node scripts/measure-js.mjs [baseUrl]   (run against `npm run start`, not dev)
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const PAGES = [
  { path: "/", as: null },
  { path: "/login", as: null },
  { path: "/register", as: null },
  { path: "/register?role=resident&code=GREENMDW", as: null }, // where an invite link lands
  { path: "/app", as: "Rahul Deshmukh" },
  { path: "/app/groceries", as: "Rahul Deshmukh" },
  { path: "/app/notifications", as: "Rahul Deshmukh" },
  { path: "/app/services", as: "Rahul Deshmukh" },
  // A Service Day's id comes from the seed, so follow the link to it.
  { path: "/app/services/[roundId]", as: "Kavya Deshpande", from: "/app/services", link: /AC servicing Service Day/ },
  { path: "/tech", as: "Raju Thapa" },
  { path: "/manager", as: "Sunita Kulkarni" },
];

/** Loads `url` in a new page with a cold cache and adds up what came over the wire. */
async function measure(context, url, { prefetch }) {
  const page = await context.newPage();
  if (!prefetch) {
    await page.route("**/*", (route) => (route.request().headers()["next-router-prefetch"] ? route.abort() : route.continue()));
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const types = new Map();
  let js = 0;
  let total = 0;
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    total += e.encodedDataLength;
    if (types.get(e.requestId) === "Script") js += e.encodedDataLength;
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.close();
  return { js: Math.round(js / 1024), total: Math.round(total / 1024) };
}

const browser = await chromium.launch();
const rows = [];
for (const { path, as, from, link } of PAGES) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  if (as) {
    await page.goto(`${base}/login`);
    await page.getByRole("button", { name: new RegExp(`Log in as ${as}`) }).click();
    await page.waitForURL((url) => url.pathname !== "/login");
  }
  let url = base + path;
  if (from) {
    await page.goto(base + from);
    url = base + (await page.getByRole("link", { name: link }).getAttribute("href"));
  }
  const own = await measure(context, url, { prefetch: false });
  const withPrefetch = await measure(context, url, { prefetch: true });
  rows.push({ page: path, "JS (KB)": own.js, "all (KB)": own.total, "+ prefetch (KB)": withPrefetch.js });
  await context.close();
}
await browser.close();
console.table(rows);

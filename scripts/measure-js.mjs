// Reports how much JavaScript key pages download (compressed bytes over the wire).
// Usage: node scripts/measure-js.mjs [baseUrl]   (run against `npm run start`, not dev)
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const PAGES = [
  { path: "/login", as: null },
  { path: "/join/GREENMDW", as: null },
  { path: "/", as: "Rahul Deshmukh" },
  { path: "/groceries", as: "Rahul Deshmukh" },
  { path: "/notifications", as: "Rahul Deshmukh" },
  { path: "/captain", as: "Sunita Kulkarni" },
];

const browser = await chromium.launch();
const rows = [];
for (const { path, as } of PAGES) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  if (as) {
    await page.goto(`${base}/login`);
    await page.getByRole("button", { name: new RegExp(`Log in as ${as}`) }).click();
    await page.waitForURL((url) => url.pathname !== "/login");
  }
  const fresh = await context.newPage(); // new page = cold JS cache for this measurement
  const cdp = await context.newCDPSession(fresh);
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
  await fresh.goto(base + path, { waitUntil: "networkidle" });
  rows.push({ page: path, "JS (KB)": Math.round(js / 1024), "all (KB)": Math.round(total / 1024) });
  await context.close();
}
await browser.close();
console.table(rows);

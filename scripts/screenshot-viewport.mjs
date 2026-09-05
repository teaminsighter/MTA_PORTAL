import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "screenshots", "viewport");
await mkdir(outDir, { recursive: true });

const base = process.env.BASE_URL ?? "http://localhost:3000";
const leadId = "MTA-2026-00421";

const routes = [
  { name: "01-inbox", path: "/inbox" },
  { name: "02-lead-workspace", path: `/leads/${leadId}` },
  { name: "03-lead-compare", path: `/leads/${leadId}/compare` },
  { name: "04-admin", path: "/admin" },
];

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  for (const r of routes) {
    await page.goto(`${base}${r.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: resolve(outDir, `${r.name}-390-viewport.png`),
      fullPage: false,
    });
    console.log(`  ${r.name} viewport → ok`);
  }
  await ctx.close();
} finally {
  await browser.close();
}

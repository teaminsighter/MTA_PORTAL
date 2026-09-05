import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "screenshots");
await mkdir(outDir, { recursive: true });

const base = process.env.BASE_URL ?? "http://localhost:3000";
const leadId = "MTA-2026-00421";

const routes = [
  { name: "01-inbox", path: "/inbox" },
  { name: "02-lead-workspace", path: `/leads/${leadId}` },
  { name: "03-lead-compare", path: `/leads/${leadId}/compare` },
  { name: "04-admin", path: "/admin" },
];

const viewports = [
  { label: "1440", width: 1440, height: 900, deviceScaleFactor: 1 },
  { label: "390", width: 390, height: 844, deviceScaleFactor: 2 },
];

const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
    });
    const page = await ctx.newPage();
    for (const r of routes) {
      const url = `${base}${r.path}`;
      process.stdout.write(`  ${vp.label}px → ${r.path} … `);
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      if (!res || !res.ok()) {
        console.log(`FAIL (status ${res?.status()})`);
        continue;
      }
      // small settle for fonts/shadows
      await page.waitForTimeout(300);
      const file = resolve(outDir, `${r.name}-${vp.label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log("ok");
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\nDone. Screenshots in ${outDir}`);

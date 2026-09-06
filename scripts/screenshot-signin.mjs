import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "screenshots");
await mkdir(outDir, { recursive: true });

const base = process.env.BASE_URL ?? "http://localhost:3030";
const cases = [
  { name: "05-signin-plain-1440", path: "/signin", w: 1440, h: 900 },
  { name: "05-signin-plain-390", path: "/signin", w: 390, h: 844 },
  {
    name: "05-signin-error-1440",
    path: "/signin?error=AccessDenied",
    w: 1440,
    h: 900,
  },
];

const browser = await chromium.launch();
try {
  for (const c of cases) {
    const ctx = await browser.newContext({
      viewport: { width: c.w, height: c.h },
      deviceScaleFactor: c.w < 500 ? 2 : 1,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto(`${base}${c.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: resolve(outDir, `${c.name}.png`),
      fullPage: false,
    });
    await ctx.close();
    console.log(`  ${c.name} → ok`);
  }
} finally {
  await browser.close();
}

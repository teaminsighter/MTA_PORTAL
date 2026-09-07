#!/usr/bin/env node
/*
 * scripts/send-test-lead.mjs
 *
 * Signs and POSTs a sample lead payload to /api/leads/webhook so you
 * can smoke-test HMAC + Zod + idempotency + ingest end-to-end without
 * a real landing page.
 *
 * Usage:
 *   pnpm test:lead                     # sends a default fake lead
 *   pnpm test:lead "12 New St, Ponsonby, Auckland 1011"   # custom address
 *
 * Env:
 *   URL=http://localhost:3030/api/leads/webhook   # override target
 *   WEBHOOK_HMAC_SECRET=…                          # override secret
 *
 * Secret resolution order: process.env → .dev.vars → .env.local. Match
 * whatever the running server loaded.
 *
 * The script prints the response body + status so you can grep for
 * `deduped: true` (idempotency working) or `d1_lead_id: MTA-YYYY-NNNNN`.
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const url = process.env.URL ?? "http://localhost:3030/api/leads/webhook";
const secret = process.env.WEBHOOK_HMAC_SECRET ?? readSecretFromDotFiles();
if (!secret) {
  console.error(
    "WEBHOOK_HMAC_SECRET not set. Add it to .dev.vars or .env.local, or export it."
  );
  process.exit(2);
}

const address = process.argv[2] ?? "42 Test Street, Ponsonby, Auckland 1011";

const payload = {
  address,
  vendor_name: "Test Vendor",
  phone: "+64 21 000 0000",
  email: "test@example.com",
  source: "web",
  // Fix submitted_at so re-running with the same args produces the
  // same idempotency hash (dedupe path). Pass FRESH=1 to force a new
  // lead each run.
  submitted_at: process.env.FRESH
    ? new Date().toISOString()
    : "2026-09-06T00:00:00.000Z",
};

const body = JSON.stringify(payload);
const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

const started = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-mta-signature": signature,
  },
  body,
});
const ms = Date.now() - started;
const text = await res.text();

console.log(`HTTP ${res.status} in ${ms}ms`);
console.log(text);

function readSecretFromDotFiles() {
  for (const filename of [".dev.vars", ".env.local"]) {
    try {
      const text = readFileSync(resolve(repoRoot, filename), "utf8");
      const match = text.match(/^\s*WEBHOOK_HMAC_SECRET\s*=\s*(.+?)\s*$/m);
      if (match) return match[1];
    } catch {
      // File missing — try the next one.
    }
  }
  return undefined;
}

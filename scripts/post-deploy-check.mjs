#!/usr/bin/env node
/*
 * scripts/post-deploy-check.mjs
 *
 * Three checks against a freshly-deployed staging / production
 * portal, matching PLAN §11 gate criteria:
 *
 *   1. /api/health returns 200 with { checks.d1.ok: true }.
 *   2. A signed test lead POSTed to /api/leads/webhook returns 200
 *      + { ok: true, d1_lead_id: MTA-YYYY-NNNNN }, and a follow-up
 *      D1 read confirms the row landed in the leads table.
 *   3. system_health.last_cron_tick_at is updated within 2 minutes
 *      (i.e. the Cron Trigger is firing the scheduled handler and
 *      the handler is writing back). Skipped with a warning if the
 *      scheduled handler isn't wired yet (Phase 6 will).
 *
 * Auth: check 1 is public; check 2 uses HMAC (public with signature);
 * check 3 uses `wrangler d1 execute --remote` and needs
 * CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment
 * (same as the deploy workflow).
 *
 * Usage:
 *   BASE_URL=https://mta-portal-staging.workers.dev \
 *   WEBHOOK_HMAC_SECRET=<the-staging-secret> \
 *   WRANGLER_ENV=staging \
 *   pnpm postdeploy:check
 *
 * Exits non-zero if any required check fails; the cron check is a
 * warning-only skip when there's no tick yet.
 */

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE_URL = process.env.BASE_URL;
const SECRET = process.env.WEBHOOK_HMAC_SECRET;
const WRANGLER_ENV = process.env.WRANGLER_ENV ?? "staging";
const CRON_MAX_STALE_MS = 2 * 60 * 1000;

if (!BASE_URL) fail("BASE_URL is required");
if (!SECRET) fail("WEBHOOK_HMAC_SECRET is required");

let hasFailure = false;

/* ------------------------- Check 1: /api/health ------------------------- */

console.log(`\n[1/3] GET ${BASE_URL}/api/health`);
try {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.checks?.d1?.ok) {
    throw new Error(`d1 check failed: ${JSON.stringify(body.checks?.d1)}`);
  }
  console.log(
    `      ok — d1 ${body.checks.d1.latency_ms}ms, cron ${
      body.checks.cron?.last_tick_at ?? "(no tick yet)"
    }`
  );
} catch (e) {
  err(`health check failed: ${e.message}`);
}

/* ------------------------- Check 2: signed test lead ------------------------- */

const submittedAt = new Date().toISOString();
const testPayload = {
  address: `Post-deploy check — ${submittedAt}`,
  vendor_name: "Post-deploy Test",
  phone: "+64 21 000 0000",
  email: "postdeploy-check@example.invalid",
  source: "web",
  submitted_at: submittedAt,
};
const body = JSON.stringify(testPayload);
const signature = crypto.createHmac("sha256", SECRET).update(body).digest("hex");

console.log(`\n[2/3] POST ${BASE_URL}/api/leads/webhook`);
let leadPublicId = null;
try {
  const res = await fetch(`${BASE_URL}/api/leads/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mta-signature": signature,
    },
    body,
  });
  const json = await res.json();
  if (res.status !== 200 || !json.ok || !json.d1_lead_id) {
    throw new Error(`HTTP ${res.status} ${JSON.stringify(json)}`);
  }
  leadPublicId = json.d1_lead_id;
  console.log(`      ok — inserted ${leadPublicId}`);
} catch (e) {
  err(`webhook check failed: ${e.message}`);
}

// Verify the row landed via a direct D1 read, since /inbox needs auth.
if (leadPublicId) {
  try {
    const rows = d1Query(
      `SELECT d1_lead_id, state, source
         FROM leads
        WHERE d1_lead_id = '${leadPublicId}';`
    );
    const found = rows.some((r) => r.d1_lead_id === leadPublicId);
    if (!found) throw new Error(`row not visible in leads table`);
    console.log(`      ok — row present in DB`);
  } catch (e) {
    err(`D1 verification failed: ${e.message}`);
  }
}

/* ------------------------- Check 3: cron tick freshness ------------------------- */

console.log(`\n[3/3] system_health.last_cron_tick_at freshness`);
try {
  const [row] = d1Query(
    `SELECT last_cron_tick_at FROM system_health WHERE id = 'singleton';`
  );
  const last = row?.last_cron_tick_at ?? null;
  if (!last) {
    console.warn(
      `      SKIP — no cron tick recorded yet. The Cloudflare Cron\n` +
        `      Trigger is scheduled but the scheduled handler isn't\n` +
        `      wired to update system_health yet (Phase 6). Re-run this\n` +
        `      check after the dispatcher handler lands.`
    );
  } else {
    const ageMs = Date.now() - new Date(last).getTime();
    if (ageMs > CRON_MAX_STALE_MS) {
      err(
        `cron tick is stale — last: ${last} (${Math.round(ageMs / 1000)}s ago)`
      );
    } else {
      console.log(`      ok — last tick ${Math.round(ageMs / 1000)}s ago`);
    }
  }
} catch (e) {
  err(`cron check failed: ${e.message}`);
}

if (hasFailure) {
  console.error("\nFAILED — see errors above.");
  process.exit(1);
}
console.log("\nAll checks passed.");

/* ------------------------- helpers ------------------------- */

function fail(msg) {
  console.error(`fatal: ${msg}`);
  process.exit(2);
}

function err(msg) {
  hasFailure = true;
  console.error(`      FAIL — ${msg}`);
}

function d1Query(sql) {
  // Wrangler prints a JSON blob on stdout when --json is passed.
  const out = execFileSync(
    "pnpm",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--env",
      WRANGLER_ENV,
      "--command",
      sql,
      "--json",
    ],
    { encoding: "utf8" }
  );
  // pnpm prints a leader line; the JSON payload is the last '[' ... ']' block.
  const jsonStart = out.indexOf("[");
  const jsonEnd = out.lastIndexOf("]");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("wrangler d1 returned no JSON");
  }
  const parsed = JSON.parse(out.slice(jsonStart, jsonEnd + 1));
  // Result shape: [{ results: [...], success: true, meta: {...} }, ...]
  return parsed.flatMap((r) => r.results ?? []);
}

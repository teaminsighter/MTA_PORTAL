# Deploy

Runbook for standing staging up on Cloudflare. Nothing in this list
is automated yet — every command is meant to be run by hand once, in
order, on the target Cloudflare account.

## Prerequisites

- You are logged into the Cloudflare account that will host staging.
  (Client's account once you're added; Imran's `insighter.digital`
  account meanwhile.)
- `nvm use && pnpm install --frozen-lockfile` succeeds locally.
- The GitHub repo has these two Actions secrets set:
  - `CLOUDFLARE_API_TOKEN` — API token with **Workers Scripts: Edit**,
    **D1: Edit**, and **Zone Settings: Read** on the target zone.
  - `CLOUDFLARE_ACCOUNT_ID` — copy from any Cloudflare dashboard URL
    (`https://dash.cloudflare.com/<ACCOUNT_ID>/...`).

## Once per account

### 1. Log wrangler into the target account

```bash
pnpm wrangler login
```

Confirm the account with:

```bash
pnpm wrangler whoami
```

### 2. Create the staging D1

```bash
pnpm wrangler d1 create mta-portal-staging
```

Copy the `database_id` UUID from the output. It looks like
`abcdef01-2345-6789-abcd-ef0123456789`.

### 3. Paste the id into `wrangler.toml`

Open `wrangler.toml` and replace this line:

```toml
[[env.staging.d1_databases]]
binding = "DB"
database_name = "mta-portal-staging"
database_id = "TODO_STAGING_D1_ID"   # ← paste real id here
```

Commit and push (the CI + deploy workflow picks it up on the next
main push).

### 4. Set every staging secret

Each of these is `wrangler secret put NAME --env staging` — wrangler
will prompt for the value, hide it, and store it against the worker.

```bash
# Auth.js session encryption (32 random bytes, base64)
pnpm wrangler secret put AUTH_SECRET --env staging
# Google OAuth client for the staging redirect URI
# (https://<subdomain>.workers.dev/api/auth/callback/google
#  OR https://portal-staging.mytopagent.co.nz/api/auth/callback/google
#  once the custom domain is live). Create a *separate* OAuth client
#  from local dev — never share client IDs across environments.
pnpm wrangler secret put AUTH_GOOGLE_ID --env staging
pnpm wrangler secret put AUTH_GOOGLE_SECRET --env staging
# HMAC secret for /api/leads/webhook. Landing page and any test
# scripts sign with this. Rotate by updating both ends together.
pnpm wrangler secret put WEBHOOK_HMAC_SECRET --env staging
# Bearer for internal-only routes the scheduled handler might hit
# (dispatcher tick, canary). Phase 6 uses this.
pnpm wrangler secret put CRON_SECRET --env staging
# Postmark. Deferred to Phase 6 — set placeholders now so wrangler
# doesn't miss them on first boot.
pnpm wrangler secret put POSTMARK_SERVER_TOKEN --env staging
# Staging-only email allowlist (comma-separated). §11 rule 9:
# staging never contacts a real vendor or agent. Anything not in
# this list gets dropped by the dispatcher on staging.
pnpm wrangler secret put POSTMARK_STAGING_ALLOWLIST --env staging
```

Non-secret env (from/name/stream, AC pipeline/stage/field IDs,
TransmitSMS sender id) live in `wrangler.toml` under
`[env.staging.vars]`. Add them to the file directly once known —
they're commented out in the current file.

### 5. Apply migrations to the remote D1

```bash
pnpm db:migrate:staging
```

Wrangler tracks applied migrations in its `d1_migrations` table, so
re-running is safe.

### 6. Seed the baseline

```bash
pnpm db:seed:staging
```

Inserts:

- one admin user (`teaminsighter@gmail.com` unless
  `SEED_ADMIN_EMAIL` env override says otherwise);
- six feature flags, all OFF;
- system_health singleton;
- two template placeholders (vendor + agent email v1);
- all 20 mock agents so the shortlist has content on first ingest;
- the year's lead sequence counter at 0.

No leads, no properties, no comparables, no picks, no candidates —
those come from real webhook traffic on staging.

## Every deploy

`git push origin main` → CI runs → on green, the deploy-staging
workflow runs and:

1. Applies any pending D1 migrations (`pnpm db:migrate:staging`).
2. Builds + deploys the OpenNext worker (`pnpm deploy:staging`).

You can also deploy from local with the same commands.

## Post-deploy check

```bash
BASE_URL=https://mta-portal-staging.<subdomain>.workers.dev \
WEBHOOK_HMAC_SECRET=<the-staging-secret> \
WRANGLER_ENV=staging \
pnpm postdeploy:check
```

Runs three checks:

1. `GET /api/health` returns 200 with `checks.d1.ok = true`.
2. A signed test lead POSTed to `/api/leads/webhook` returns 200,
   and the row is visible in `leads` via a `wrangler d1 execute`
   read.
3. `system_health.last_cron_tick_at` is fresher than 2 minutes.
   **Currently expected to SKIP** — the Cron Trigger is scheduled
   but the scheduled handler that writes back doesn't exist yet
   (Phase 6). The script prints a warning and moves on; re-run the
   check once the dispatcher handler is wired.

## Custom domain (later)

The default deploy lands on
`https://mta-portal-staging.<subdomain>.workers.dev`. Once the DNS
zone `mytopagent.co.nz` is on the target Cloudflare account:

1. Uncomment the `[[env.staging.routes]]` block in `wrangler.toml`:

   ```toml
   [[env.staging.routes]]
   pattern = "portal-staging.mytopagent.co.nz"
   custom_domain = true
   ```

2. Update the Google OAuth client's **Authorised redirect URI** to
   `https://portal-staging.mytopagent.co.nz/api/auth/callback/google`
   (add — don't remove the workers.dev URI, so both work during a
   cutover window).
3. Redeploy.

## Production

The `deploy-production` workflow is scaffolded but **disabled**:

```yaml
if: ${{ vars.DEPLOY_PRODUCTION_ENABLED == 'true' }}
```

Enable by setting the repo variable `DEPLOY_PRODUCTION_ENABLED=true`
once:

- Sean's Cloudflare account has us added.
- Production D1 is created there and its id is pasted into
  `wrangler.toml`.
- All production secrets (`--env production`) are set.
- A `v*` tag exists to fire the workflow.

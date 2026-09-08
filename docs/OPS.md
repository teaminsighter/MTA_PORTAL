# Ops notes

Running list of production-readiness gotchas. Each entry is short and
actionable — expand a section into its own doc if it grows past a few
paragraphs.

## Rate limiting

**Current implementation:** `src/lib/rate-limit.ts` is an in-memory
sliding-window map, one bucket per key (`lead-webhook:<ip>` for the
ingest endpoint). Bounded to 10 000 keys with a stale-bucket sweep.

**Why this is a problem for production:**

- **Per-isolate.** Cloudflare Workers create a fresh isolate per POP,
  per script instance. Each isolate has its own memory, so an attacker
  can spread 30 requests × N isolates and never hit the limit from any
  single bucket. The 30/60s promise is only true when all traffic hits
  one process — fine for local dev, wrong for CF Workers.
- **Cold start resets.** Isolates get recycled. Rate limits reset when
  they do, giving an attacker fresh budget every few minutes.
- **No distributed truth.** No two isolates agree on the count.

**Before real traffic:** swap the internal helper (or add an env-aware
branch) to one of:

1. **Cloudflare Rate Limiting API** — first choice. Bind a limiter in
   `wrangler.toml`, call `env.RATE_LIMITER.limit({ key })`. Same
   sliding-window semantics, distributed, no code to maintain.
2. **KV or D1 counter** with a TTL. Cheaper than the Rate Limiting API
   for very low traffic; more moving parts. Only worth it if the
   monthly RL API fee bothers Sean.

Both switches are contained to `src/lib/rate-limit.ts`. Callers keep
`isRateLimited(key, limit, windowMs)` unchanged.

**Symptom to watch for:** if `/api/leads/webhook` starts serving 200s
to an obvious flood without any 429s in logs, that's the multi-isolate
problem biting.

## Migrations

- Wrangler tracks applied migrations in D1's internal `d1_migrations`
  table. `pnpm db:migrate:local` and (later)
  `pnpm wrangler d1 migrations apply DB --remote --env staging` are
  the only supported ways to apply schema — never `d1 execute --file`
  against a migration, or the tracker desyncs.
- Migrations under `drizzle/` are strictly `NNNN_name.sql`. Anything
  else placed in that directory (e.g. a seed dump) will be treated as
  a migration on the next apply. The seed generator writes to
  `.wrangler/seed.sql` for that reason.
- Forward-only. If a migration turns out wrong, write a follow-up that
  fixes it — never edit an applied migration in place. The one
  exception is pre-first-deploy dev churn, when the counter row + full
  reset is cheap.

## Env / secrets

Per the "no hardcoded identity" rule (see memory), every sender email,
domain, message stream, sender ID, AC pipeline/stage/field ID lives in
env. See `.dev.vars.example` for the current list.

- **Local dev** reads `.env.local` (Node process.env, e.g. Auth.js) and
  `.dev.vars` (miniflare-side Cloudflare bindings). Same values in
  both is fine — they're both gitignored.
- **Staging / production** use `wrangler secret put NAME --env <env>`
  for secrets and `[env.<env>.vars]` in `wrangler.toml` for
  non-secret config.

## Local DB reset

```
rm -rf .wrangler/state/v3/d1
pnpm db:migrate:local
pnpm db:seed:local
```

Idempotent. Wipes miniflare's SQLite, re-applies all migrations, and
re-seeds. Use whenever a rebase brings in a new migration or the seed
shape changes.

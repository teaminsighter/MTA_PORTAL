/*
 * Demo-mode flag.
 *
 * When DEMO_MODE=1 in env:
 *   - Middleware skips auth. No sign-in required.
 *   - Every repo short-circuits to src/mock/*.json instead of D1.
 *   - Every server action returns { ok: true, ...plausible mock }
 *     so UI feedback stays green and the whole workspace is
 *     clickable without any DB writes.
 *
 * Used exclusively for the client-facing UI walkthrough deployed
 * to a Cloudflare Worker on a demo subdomain. Real staging and
 * production must never boot with this flag set (which is why the
 * bootstrap admin user + full DB path is untouched by this flag).
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

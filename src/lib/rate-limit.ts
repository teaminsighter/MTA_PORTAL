/*
 * Simple in-process sliding-window rate limiter.
 *
 * Fine for local dev + a single-worker deployment. For multi-instance
 * Cloudflare Workers (staging/production) swap to the CF Rate Limiting
 * API (env.RATE_LIMITER.limit({ key })). Interface stays the same so
 * only this file changes.
 *
 * The map is bounded — a stale bucket sweep triggers when the map
 * grows past MAX_KEYS so a hostile IP can't OOM the worker.
 */

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter(
    (t) => now - t < windowMs
  );
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  if (buckets.size > MAX_KEYS) sweep(now, windowMs);
  return false;
}

/**
 * Test-only: wipe all buckets. Called from `beforeEach` so per-test
 * IPs don't leak across the suite.
 */
export function resetRateLimit(): void {
  buckets.clear();
}

function sweep(now: number, windowMs: number): void {
  for (const [k, ts] of buckets) {
    const kept = ts.filter((t) => now - t < windowMs);
    if (kept.length === 0) buckets.delete(k);
    else buckets.set(k, kept);
  }
}

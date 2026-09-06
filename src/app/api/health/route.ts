import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { system_health } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * /api/health — public. Called by uptime monitors every 5m per §11.8.
 *
 * Checks:
 *   d1        — SELECT 1 round-trip with elapsed_ms
 *   cron      — freshness of system_health.last_cron_tick_at.
 *               Once the dispatcher and reconciler crons are live
 *               (Phase 6/7), they bump these timestamps each tick.
 *
 * Response is intentionally minimal, machine-readable, and returns
 * 503 when unhealthy so a monitor can treat the HTTP status alone.
 * Auth-independent: middleware.ts excludes /api/health from the
 * signed-in matcher.
 *
 * If Phase 6+ adds more downstream checks (Postmark, TransmitSMS, AC,
 * Cotality auth), they get added here — each behind its own feature
 * flag so switching a provider off doesn't page.
 */

type Check = { ok: boolean; latency_ms?: number; detail?: string };

async function checkD1(): Promise<Check> {
  const started = Date.now();
  try {
    const rows = await getDb().run(sql`SELECT 1 AS ok`);
    // .run returns a raw result object; presence of `success` (D1) or a
    // populated rows array is enough. We only care that the query didn't
    // throw. Latency is the useful signal.
    void rows;
    return { ok: true, latency_ms: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      detail: (e as Error).message,
    };
  }
}

const CRON_STALE_AFTER_MS = 10 * 60 * 1000; // §11.10 alert threshold

async function checkCron(): Promise<Check & { last_tick_at: string | null }> {
  try {
    const [row] = await getDb()
      .select({ last_cron_tick_at: system_health.last_cron_tick_at })
      .from(system_health)
      .limit(1);
    const last = row?.last_cron_tick_at ?? null;
    if (!last) {
      // No cron yet (Phase 1 has no scheduled workers). Report as ok +
      // detail so the monitor can distinguish "never ticked" from
      // "silent". Flip to `ok: false` once Phase 6 lands the dispatcher.
      return { ok: true, detail: "no cron configured yet", last_tick_at: null };
    }
    const age = Date.now() - new Date(last).getTime();
    return {
      ok: age < CRON_STALE_AFTER_MS,
      last_tick_at: last,
      detail: age >= CRON_STALE_AFTER_MS ? "stale" : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      last_tick_at: null,
      detail: (e as Error).message,
    };
  }
}

export async function GET() {
  const [d1, cron] = await Promise.all([checkD1(), checkCron()]);
  const ok = d1.ok && cron.ok;
  return Response.json(
    {
      ok,
      at: new Date().toISOString(),
      checks: { d1, cron },
    },
    { status: ok ? 200 : 503 }
  );
}
